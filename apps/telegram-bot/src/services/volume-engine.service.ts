import { injectable, inject } from "inversify";
import { Connection, Keypair } from "@solana/web3.js";
import { TYPES } from "../types";
import { SupabaseService } from "./supabase.service";
import { solanaRpcUrl } from "../config";
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

  constructor(@inject(TYPES.SupabaseService) supabaseService: SupabaseService) {
    this.connection = new Connection(
      solanaRpcUrl || "https://api.mainnet-beta.solana.com",
      "confirmed",
    );
    this.supabaseService = supabaseService;
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
    const currentTasks = await this.supabaseService.getOrderTasks(orderId);
    let processedTasks = 0;

    for (const task of currentTasks) {
      // Skip completed tasks
      if (task.status === TaskStatus.COMPLETED) continue;

      // Check if it's time to execute this task
      const shouldExecute = await this.shouldExecuteTask(task);
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
    if (
      task.status === TaskStatus.COMPLETED ||
      task.status === TaskStatus.FAILED
    )
      return false;

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
    _order: VolumeOrder,
  ): Promise<void> {
    // This is a simulation of buy/sell transactions
    // In production, you would implement actual Solana transactions here

    console.log(`🔄 Simulating buy/sell cycle for task ${task.id}`);

    // Simulate random transaction amounts
    const baseAmount = 0.1; // Base SOL amount
    const randomMultiplier = 0.5 + Math.random(); // 0.5x to 1.5x variation
    const transactionAmount = baseAmount * randomMultiplier;

    // Simulate buy transaction
    const buyTransaction = {
      task_id: task.id,
      signature: this.generateMockSignature(),
      type: "buy" as const,
      amount_sol: transactionAmount,
      amount_tokens: transactionAmount * 1000, // Mock token amount
      price: 0.001, // Mock price
    };

    await this.supabaseService.createTransaction(buyTransaction);

    // Wait a bit between buy and sell
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Simulate sell transaction (smaller amount)
    const sellAmount = transactionAmount * 0.8; // Sell 80% of what we bought
    const sellTransaction = {
      task_id: task.id,
      signature: this.generateMockSignature(),
      type: "sell" as const,
      amount_sol: sellAmount,
      amount_tokens: sellAmount * 1000,
      price: 0.001,
    };

    await this.supabaseService.createTransaction(sellTransaction);
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
}
