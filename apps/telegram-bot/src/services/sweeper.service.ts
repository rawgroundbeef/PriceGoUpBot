import { injectable, inject } from "inversify";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  Keypair,
} from "@solana/web3.js";
import { TYPES } from "../types";
import { SupabaseService } from "./supabase.service";
import { VolumeOrderService } from "./volume-order.service";
import { OrderStatus } from "../interfaces";
import {
  SOLANA_RPC_URL,
  TREASURY_FEES_ADDRESS,
  TREASURY_OPERATIONS_ADDRESS,
  FEE_BPS,
  MIN_SWEEP_LAMPORTS,
} from "../config";

@injectable()
export class SweeperService {
  private connection: Connection;
  private supabaseService: SupabaseService;
  private volumeOrderService: VolumeOrderService;

  constructor(
    @inject(TYPES.SupabaseService) supabaseService: SupabaseService,
    @inject(TYPES.VolumeOrderService) volumeOrderService: VolumeOrderService,
  ) {
    this.connection = new Connection(
      SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
      "confirmed",
    );
    this.supabaseService = supabaseService;
    this.volumeOrderService = volumeOrderService;
  }

  async sweepAllPendingPayments(): Promise<{
    processed: number;
    swept: number;
    errors: string[];
  }> {
    const result = {
      processed: 0,
      swept: 0,
      errors: [] as string[],
    };

    try {
      // Find orders that might need sweeping
      const pendingOrders = await this.supabaseService.getOrdersByStatus(
        OrderStatus.PENDING_PAYMENT,
      );
      const confirmedOrders = await this.supabaseService.getOrdersByStatus(
        OrderStatus.PAYMENT_CONFIRMED,
      );
      const runningOrders = await this.supabaseService.getOrdersByStatus(
        OrderStatus.RUNNING,
      );

      const ordersToCheck = [
        ...pendingOrders,
        ...confirmedOrders,
        ...runningOrders,
      ];
      console.log(
        `🔍 Checking ${ordersToCheck.length} orders for payments to sweep`,
      );

      for (const order of ordersToCheck) {
        try {
          result.processed++;
          const swept = await this.sweepOrderPayment(order.id);
          if (swept) {
            result.swept++;
          }
        } catch (error) {
          const errorMsg = `Error sweeping order ${order.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
          console.error(`❌ ${errorMsg}`);
          result.errors.push(errorMsg);
        }
      }

      console.log(
        `✅ Sweep completed: ${result.swept}/${result.processed} orders swept`,
      );
      return result;
    } catch (error) {
      console.error("❌ Error in sweepAllPendingPayments:", error);
      throw error;
    }
  }

  async sweepOrderPayment(orderId: string): Promise<boolean> {
    const order = await this.supabaseService.getVolumeOrder(orderId);
    if (!order) {
      console.log(`⚠️ Order ${orderId} not found`);
      return false;
    }

    // Skip if already swept (has sweep signatures) or invalid status
    if (order.payment_signature && order.payment_signature.includes("fees:")) {
      console.log(`⚠️ Order ${orderId.substring(0, 8)} already swept`);
      return false;
    }

    if (
      order.status === OrderStatus.COMPLETED ||
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.FAILED
    ) {
      return false;
    }

    try {
      // For existing orders, use the stored payment address
      // For new orders (created with HKDF), derive from order ID
      let paymentKeypair;
      let paymentAddress;

      if (order.payment_address && order.payment_address !== "TEMP") {
        // Use stored address (legacy orders or already set)
        paymentAddress = new PublicKey(order.payment_address);

        // Try to derive keypair - if it matches stored address, we can sweep
        try {
          const derivedKeypair =
            await this.volumeOrderService.derivePaymentKeypair(orderId);
          if (derivedKeypair.publicKey.toString() === order.payment_address) {
            paymentKeypair = derivedKeypair;
            console.log(
              `🔑 Using HKDF-derived keypair for order ${orderId.substring(0, 8)}`,
            );
          } else {
            console.log(
              `⚠️ Order ${orderId.substring(0, 8)} uses legacy address, cannot derive private key`,
            );
            return false;
          }
        } catch {
          console.log(
            `⚠️ Order ${orderId.substring(0, 8)} cannot derive keypair`,
          );
          return false;
        }
      } else {
        // Derive both address and keypair
        paymentKeypair =
          await this.volumeOrderService.derivePaymentKeypair(orderId);
        paymentAddress = paymentKeypair.publicKey;
      }

      // Check balance
      const balance = await this.connection.getBalance(paymentAddress);
      console.log(
        `💰 Order ${orderId.substring(0, 8)}: ${balance / LAMPORTS_PER_SOL} SOL in payment address`,
      );

      if (balance < MIN_SWEEP_LAMPORTS) {
        console.log(
          `⚠️ Balance too low to sweep (${balance} < ${MIN_SWEEP_LAMPORTS})`,
        );
        return false;
      }

      // Check if payment meets expected amount
      const expectedLamports = Math.floor(order.total_cost * LAMPORTS_PER_SOL);
      if (balance < expectedLamports * 0.99) {
        // 1% tolerance
        console.log(
          `⚠️ Payment insufficient: ${balance} < ${expectedLamports} lamports`,
        );
        return false;
      }

      // Calculate fee split
      const serviceFeeRate = FEE_BPS / 10000;
      const serviceFeeAmount = Math.floor(balance * serviceFeeRate);
      const opsAmount = balance - serviceFeeAmount - 10000; // Keep 10k lamports for tx fees

      console.log(
        `💸 Splitting ${balance / LAMPORTS_PER_SOL} SOL: ${serviceFeeAmount / LAMPORTS_PER_SOL} fees, ${opsAmount / LAMPORTS_PER_SOL} ops`,
      );

      // Build transactions
      const feesSig = await this.sendToTreasury(
        paymentKeypair,
        TREASURY_FEES_ADDRESS,
        serviceFeeAmount,
        "fees",
      );
      // Send ops share to per-order ops budget wallet instead of global ops
      const perOrderOpsAddress =
        await this.volumeOrderService.deriveOpsBudgetAddress(orderId);
      const opsSig = await this.sendToTreasury(
        paymentKeypair,
        perOrderOpsAddress,
        opsAmount,
        "operations-budget",
      );

      // Update order with sweep signatures and confirm payment
      await this.supabaseService.updateVolumeOrder(orderId, {
        status: OrderStatus.PAYMENT_CONFIRMED,
        payment_signature: `fees:${feesSig},ops:${opsSig}`, // Store both signatures
      });

      console.log(
        `✅ Swept order ${orderId.substring(0, 8)}: fees=${feesSig.substring(0, 8)}..., ops=${opsSig.substring(0, 8)}...`,
      );
      return true;
    } catch (error) {
      console.error(`❌ Error sweeping order ${orderId}:`, error);
      throw error;
    }
  }

  private async sendToTreasury(
    fromKeypair: Keypair,
    toAddress: string,
    lamports: number,
    purpose: string,
  ): Promise<string> {
    if (!toAddress) {
      throw new Error(`Treasury address for ${purpose} not configured`);
    }

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: new PublicKey(toAddress),
        lamports,
      }),
    );

    // Get recent blockhash
    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromKeypair.publicKey;

    // Sign and send
    transaction.sign(fromKeypair);
    const signature = await this.connection.sendRawTransaction(
      transaction.serialize(),
    );

    // Wait for confirmation
    await this.connection.confirmTransaction(signature, "confirmed");

    console.log(
      `💸 Sent ${lamports / LAMPORTS_PER_SOL} SOL to ${purpose} treasury: ${signature.substring(0, 8)}...`,
    );
    return signature;
  }
}
