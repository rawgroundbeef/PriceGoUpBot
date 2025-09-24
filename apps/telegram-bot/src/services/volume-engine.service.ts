import { injectable, inject } from "inversify";
import { Connection, Keypair } from "@solana/web3.js";
import { TYPES } from "../types";
import { SupabaseService } from "./supabase.service";
import { JupiterTradingService } from "./jupiter-trading.service";
import { VolumeOrderService } from "./volume-order.service";
import {
  solanaRpcUrl,
  TREASURY_OPERATIONS_ADDRESS,
  walletMasterSeed,
} from "../config";
const { hkdf } = require("@panva/hkdf");
import {
  VolumeOrder,
  VolumeTask,
  TaskStatus,
  IVolumeEngineService,
  OrderStatus,
} from "../interfaces";
// import { v4 as uuidv4 } from 'uuid'; // Unused

@injectable()
export class VolumeEngineService implements IVolumeEngineService {
  private connection: Connection;
  private supabaseService: SupabaseService;
  private jupiterTradingService: JupiterTradingService;
  private volumeOrderService: VolumeOrderService;

  constructor(
    @inject(TYPES.SupabaseService) supabaseService: SupabaseService,
    @inject(TYPES.JupiterTradingService)
    jupiterTradingService: JupiterTradingService,
    @inject(TYPES.VolumeOrderService) volumeOrderService: VolumeOrderService,
  ) {
    this.connection = new Connection(
      solanaRpcUrl || "https://api.mainnet-beta.solana.com",
      "confirmed",
    );
    this.supabaseService = supabaseService;
    this.jupiterTradingService = jupiterTradingService;
    this.volumeOrderService = volumeOrderService;
  }

  async startVolumeGeneration(orderId: string): Promise<void> {
    try {
      const order = await this.supabaseService.getVolumeOrder(orderId);
      if (!order) {
        throw new Error("Order not found");
      }

      if (order.status !== OrderStatus.PAYMENT_CONFIRMED) {
        throw new Error("Order payment not confirmed");
      }

      // Update order status to running
      await this.supabaseService.updateVolumeOrder(orderId, {
        status: OrderStatus.RUNNING,
        started_at: new Date().toISOString(),
      });

      // Create volume tasks
      const tasks = await this.createVolumeTasks(order);

      console.log(
        `✅ Started volume generation for order ${orderId} with ${tasks.length} tasks`,
      );
      console.log(
        `📊 Tasks will be processed by the volume-processor cron job every 5 minutes`,
      );
    } catch (error) {
      console.error(
        `❌ Error starting volume generation for order ${orderId}:`,
        error,
      );

      // Update order status to failed
      await this.supabaseService.updateVolumeOrder(orderId, {
        status: OrderStatus.FAILED,
        completed_at: new Date().toISOString(),
      });

      throw error;
    }
  }

  async stopVolumeGeneration(orderId: string): Promise<void> {
    try {
      // Update order status
      await this.supabaseService.updateVolumeOrder(orderId, {
        status: OrderStatus.COMPLETED,
        completed_at: new Date().toISOString(),
      });

      // Update all running tasks to completed
      const tasks = await this.supabaseService.getOrderTasks(orderId);
      for (const task of tasks) {
        if (task.status === TaskStatus.RUNNING) {
          await this.supabaseService.updateVolumeTask(task.id, {
            status: TaskStatus.COMPLETED,
          });
        }
      }

      console.log(`✅ Stopped volume generation for order ${orderId}`);
    } catch (error) {
      console.error(
        `❌ Error stopping volume generation for order ${orderId}:`,
        error,
      );
      throw error;
    }
  }

  async getOrderProgress(orderId: string): Promise<{
    totalVolume: number;
    completedTasks: number;
    runningTasks: number;
  }> {
    return await this.supabaseService.getOrderProgress(orderId);
  }

  private async createVolumeTasks(order: VolumeOrder): Promise<VolumeTask[]> {
    const tasks: Omit<VolumeTask, "id" | "created_at" | "updated_at">[] = [];

    // Calculate volume per task
    const volumePerTask = order.volume_target / order.tasks_count;

    // Calculate interval between cycles (not tasks)
    // Each task should complete its 5 cycles over the duration
    const totalCycles = order.tasks_count * 5; // 5 cycles per task
    const intervalMinutes = Math.floor(
      (order.duration_hours * 60) / totalCycles,
    );

    for (let i = 0; i < order.tasks_count; i++) {
      // Generate a unique wallet for this task
      const wallet = Keypair.generate();

      tasks.push({
        order_id: order.id,
        wallet_address: wallet.publicKey.toString(),
        status: TaskStatus.PENDING,
        target_volume: volumePerTask,
        current_volume: 0,
        interval_minutes: Math.max(1, intervalMinutes), // At least 1 minute
        cycles_completed: 0,
        total_cycles: 5, // 3 buys + 2 sells per task
      });
    }

    return await this.supabaseService.createVolumeTasks(tasks);
  }

  /**
   * Process all pending volume tasks across all running orders
   * This method is designed to be called by the volume-processor cron job
   */
  async processAllPendingTasks(): Promise<{
    processedTasks: number;
    completedOrders: string[];
    errors: string[];
  }> {
    const result = {
      processedTasks: 0,
      completedOrders: [] as string[],
      errors: [] as string[],
    };

    try {
      // Get all running orders
      const runningOrders = await this.getRunningOrders();
      console.log(`📊 Found ${runningOrders.length} running orders to process`);

      for (const order of runningOrders) {
        try {
          const orderResult = await this.processOrderTasks(order.id);
          result.processedTasks += orderResult.processedTasks;

          if (orderResult.orderCompleted) {
            result.completedOrders.push(order.id);
          }
        } catch (error) {
          const errorMsg = `Error processing order ${order.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
          console.error(`❌ ${errorMsg}`);
          result.errors.push(errorMsg);
        }
      }

      console.log(
        `✅ Processed ${result.processedTasks} tasks, completed ${result.completedOrders.length} orders`,
      );
      return result;
    } catch (error) {
      console.error("❌ Error in processAllPendingTasks:", error);
      throw error;
    }
  }

  /**
   * Process tasks for a specific order
   */
  private async processOrderTasks(orderId: string): Promise<{
    processedTasks: number;
    orderCompleted: boolean;
  }> {
    const order = await this.supabaseService.getVolumeOrder(orderId);
    if (!order || order.status !== OrderStatus.RUNNING) {
      return { processedTasks: 0, orderCompleted: false };
    }

    // Get current task states
    let currentTasks = await this.supabaseService.getOrderTasks(orderId);
    console.log(
      `🧩 Order ${orderId} has ${currentTasks.length} tasks in DB (status counts: ` +
        `${
          currentTasks.reduce<Record<string, number>>((acc, t) => {
            acc[t.status] = (acc[t.status] || 0) + 1;
            return acc;
          }, {}) as unknown as string
        })`,
    );
    if (currentTasks.length === 0) {
      console.warn(
        `⚠️ No tasks found for running order ${orderId}; creating tasks now`,
      );
      await this.createVolumeTasks(order);
      currentTasks = await this.supabaseService.getOrderTasks(orderId);
      console.log(
        `🧩 After creation, order ${orderId} has ${currentTasks.length} tasks`,
      );
    }
    let processedTasks = 0;

    for (const task of currentTasks) {
      // Skip completed tasks
      if (task.status === TaskStatus.COMPLETED) continue;

      // Check if it's time to execute this task
      const shouldExecute = await this.shouldExecuteTask(task);
      console.log(
        `⏱️ Task ${task.id.substring(0, 8)} status=${task.status} last=${task.last_transaction_at || "never"} interval=${task.interval_minutes}m -> shouldExecute=${shouldExecute}`,
      );
      if (!shouldExecute) continue;

      try {
        // Update task status to running
        if (task.status === TaskStatus.PENDING) {
          await this.supabaseService.updateVolumeTask(task.id, {
            status: TaskStatus.RUNNING,
          });
        }

        // Execute a buy/sell cycle for this task
        await this.executeBuySellCycle(task, order);

        // Update task progress
        const newCyclesCompleted = task.cycles_completed + 1;
        const progressPercentage = newCyclesCompleted / task.total_cycles;
        const newVolume = task.target_volume * progressPercentage;

        await this.supabaseService.updateVolumeTask(task.id, {
          cycles_completed: newCyclesCompleted,
          current_volume: newVolume,
          last_transaction_at: new Date().toISOString(),
          status:
            newCyclesCompleted >= task.total_cycles
              ? TaskStatus.COMPLETED
              : TaskStatus.RUNNING,
        });

        processedTasks++;
        console.log(
          `📈 Executed cycle ${newCyclesCompleted}/${task.total_cycles} for task ${task.id}`,
        );
      } catch (error) {
        console.error(`❌ Error executing task ${task.id}:`, error);

        await this.supabaseService.updateVolumeTask(task.id, {
          status: TaskStatus.FAILED,
          last_transaction_at: new Date().toISOString(),
        });
      }
    }

    // Check if all tasks are completed
    const updatedTasks = await this.supabaseService.getOrderTasks(orderId);
    const completedTasks = updatedTasks.filter(
      (task) => task.status === TaskStatus.COMPLETED,
    );

    if (completedTasks.length === updatedTasks.length) {
      // All tasks completed, stop the order
      await this.stopVolumeGeneration(orderId);
      return { processedTasks, orderCompleted: true };
    }

    return { processedTasks, orderCompleted: false };
  }

  private async shouldExecuteTask(task: VolumeTask): Promise<boolean> {
    // If task is pending, execute immediately
    if (task.status === TaskStatus.PENDING) return true;

    // If task is completed, don't execute
    if (task.status === TaskStatus.COMPLETED) return false;

    // Allow FAILED tasks to retry after a short cooldown
    if (task.status === TaskStatus.FAILED) {
      const retryCooldownMinutes = 5; // minimal cooldown
      if (!task.last_transaction_at) return true;
      const last = new Date(task.last_transaction_at);
      const minutes = (Date.now() - last.getTime()) / (1000 * 60);
      return minutes >= retryCooldownMinutes;
    }

    // Check if enough time has passed since last execution
    if (!task.last_transaction_at) return true;

    const lastExecution = new Date(task.last_transaction_at);
    const now = new Date();
    const minutesSinceLastExecution =
      (now.getTime() - lastExecution.getTime()) / (1000 * 60);

    return minutesSinceLastExecution >= task.interval_minutes;
  }

  private async executeBuySellCycle(
    task: VolumeTask,
    order: VolumeOrder,
  ): Promise<void> {
    console.log(`🔄 Executing REAL buy/sell cycle for task ${task.id}`);

    try {
      // 1. Derive trading wallet for this task
      const tradingKeypair = await this.deriveTradingKeypair(task.id);

      // 2. Calculate trade amount (0.05-0.2 SOL per cycle)
      const baseAmount = 0.05 + Math.random() * 0.15; // 0.05 to 0.2 SOL
      const tradeLamports = Math.floor(baseAmount * 1e9);

      // 3. Fund trading wallet if needed
      await this.ensureTradingWalletFunded(tradingKeypair, tradeLamports * 2); // 2x for fees

      // 4. Execute BUY transaction (SOL -> Token)
      console.log(
        `🟢 BUY: ${baseAmount.toFixed(4)} SOL -> ${order.token_address.substring(0, 8)}...`,
      );
      const buyResult = await this.jupiterTradingService.executeBuy(
        tradingKeypair,
        order.token_address,
        tradeLamports,
        300, // 3% slippage
      );

      if (!buyResult.success) {
        throw new Error(`Buy failed: ${buyResult.error}`);
      }

      // 5. Wait a short time (1-5 seconds)
      const waitTime = 1000 + Math.random() * 4000; // 1-5 seconds
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // 6. Execute SELL transaction (Token -> SOL) - only if buy succeeded
      let sellResult = null;
      if (buyResult.amountOut) {
        console.log(`🔴 SELL: ${buyResult.amountOut} tokens -> SOL`);
        sellResult = await this.jupiterTradingService.executeSell(
          tradingKeypair,
          order.token_address,
          buyResult.amountOut,
          300, // 3% slippage
        );

        if (!sellResult.success) {
          console.warn(
            `⚠️ Sell failed: ${sellResult.error}, but buy succeeded`,
          );
        }
      }

      // 7. Store transactions in database
      const buyTransaction = {
        task_id: task.id,
        signature: buyResult.signature || "failed",
        type: "buy" as const,
        amount_sol: buyResult.amountIn / 1e9,
        amount_tokens: buyResult.amountOut || 0,
        price: buyResult.amountOut
          ? buyResult.amountIn / 1e9 / buyResult.amountOut
          : 0,
      };

      await this.supabaseService.createTransaction(buyTransaction);

      if (sellResult) {
        const sellTransaction = {
          task_id: task.id,
          signature: sellResult.signature || "failed",
          type: "sell" as const,
          amount_sol: sellResult.amountOut ? sellResult.amountOut / 1e9 : 0,
          amount_tokens: buyResult.amountOut || 0,
          price:
            sellResult.amountOut && buyResult.amountOut
              ? sellResult.amountOut / 1e9 / buyResult.amountOut
              : 0,
        };

        await this.supabaseService.createTransaction(sellTransaction);
      }

      console.log(
        `✅ Task ${task.id} completed: ${baseAmount.toFixed(4)} SOL volume generated`,
      );

      // 8. Sweep any remaining funds back to treasury
      await this.sweepTradingWallet(tradingKeypair);
    } catch (error) {
      console.error(`❌ Task ${task.id} failed:`, error);

      // Still record failed attempt with unique signature
      const failedTransaction = {
        task_id: task.id,
        signature: `failed-${task.id}-${Date.now()}`, // Unique failed signature
        type: "buy" as const,
        amount_sol: 0,
        amount_tokens: 0,
        price: 0,
      };

      await this.supabaseService.createTransaction(failedTransaction);
      throw error;
    }
  }

  private generateMockSignature(): string {
    // Generate a mock transaction signature for simulation
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < 88; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Get all running orders that need processing
   */
  private async getRunningOrders(): Promise<VolumeOrder[]> {
    try {
      // Get all orders with running status
      const orders = await this.supabaseService.getOrdersByStatus(
        OrderStatus.RUNNING,
      );
      return orders;
    } catch (error) {
      console.error("Error getting running orders:", error);
      return [];
    }
  }

  /**
   * Initialize volume engine
   */
  async initialize(): Promise<void> {
    console.log("🔄 Initializing Volume Engine (Stateless Mode)...");
    console.log("📊 Volume processing will be handled by cron jobs");
    console.log("✅ Volume Engine initialized");
  }

  /**
   * Derive a trading wallet keypair for a specific task
   */
  private async deriveTradingKeypair(taskId: string): Promise<Keypair> {
    if (!walletMasterSeed) {
      throw new Error("WALLET_MASTER_SEED not configured");
    }

    // Convert master seed from hex to bytes
    const masterSeedBytes = Buffer.from(walletMasterSeed, "hex");

    // Use HKDF to derive a deterministic key for this task
    const derivedKey = await hkdf(
      "sha256",
      masterSeedBytes,
      new Uint8Array(0), // salt
      Buffer.from(`task-${taskId}`, "utf8"), // info
      32, // key length
    );

    return Keypair.fromSeed(new Uint8Array(derivedKey));
  }

  /**
   * Ensure trading wallet has enough funds for trading
   */
  private async ensureTradingWalletFunded(
    tradingKeypair: Keypair,
    requiredLamports: number,
  ): Promise<void> {
    const currentBalance = await this.jupiterTradingService.getSolBalance(
      tradingKeypair.publicKey,
    );

    if (currentBalance < requiredLamports) {
      console.log(
        `💰 Funding trading wallet: ${requiredLamports / 1e9} SOL needed, ${currentBalance / 1e9} SOL available`,
      );

      // Get treasury operations keypair (derived from master seed, matches get-treasury-addresses.js)
      const treasuryKeypair = await this.deriveOpsKeypair();
      console.log(
        `🏦 Using ops signer: ${treasuryKeypair.publicKey.toBase58()} (env TREASURY_OPERATIONS_ADDRESS=${TREASURY_OPERATIONS_ADDRESS || "<unset>"})`,
      );

      // Fund the trading wallet from treasury operations
      await this.jupiterTradingService.fundTradingWallet(
        treasuryKeypair,
        tradingKeypair.publicKey,
        requiredLamports - currentBalance + 5000000, // Add 0.005 SOL buffer for fees
      );
    }
  }

  /**
   * Derive the treasury-operations keypair (HKDF info='treasury-operations', empty salt)
   */
  private async deriveOpsKeypair(): Promise<Keypair> {
    if (!walletMasterSeed) {
      throw new Error("WALLET_MASTER_SEED not configured");
    }
    const masterSeedBytes = Buffer.from(walletMasterSeed, "hex");
    const derivedKey = await hkdf(
      "sha256",
      masterSeedBytes,
      new Uint8Array(0), // empty salt
      Buffer.from("treasury-operations", "utf8"), // info
      32,
    );
    return Keypair.fromSeed(new Uint8Array(derivedKey));
  }

  /**
   * Sweep remaining funds from trading wallet back to treasury
   */
  private async sweepTradingWallet(tradingKeypair: Keypair): Promise<void> {
    try {
      const balance = await this.jupiterTradingService.getSolBalance(
        tradingKeypair.publicKey,
      );

      // Keep minimum for rent exemption and fees
      const minBalance = 5000000; // 0.005 SOL

      if (balance > minBalance) {
        const sweepAmount = balance - minBalance;

        if (!TREASURY_OPERATIONS_ADDRESS) {
          console.warn(
            "⚠️ TREASURY_OPERATIONS_ADDRESS not configured, skipping sweep",
          );
          return;
        }

        const { SystemProgram, Transaction, PublicKey } = await import(
          "@solana/web3.js"
        );

        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: tradingKeypair.publicKey,
            toPubkey: new PublicKey(TREASURY_OPERATIONS_ADDRESS),
            lamports: sweepAmount,
          }),
        );

        const signature = await this.connection.sendTransaction(
          transaction,
          [tradingKeypair],
          {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          },
        );

        await this.connection.confirmTransaction(signature, "confirmed");

        console.log(
          `🧹 Swept ${sweepAmount / 1e9} SOL back to treasury | ${signature.substring(0, 8)}...`,
        );
      }
    } catch (error) {
      console.warn("⚠️ Failed to sweep trading wallet:", error);
      // Don't throw - sweeping is optional
    }
  }
}
