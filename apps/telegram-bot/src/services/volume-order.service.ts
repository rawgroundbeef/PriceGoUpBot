import { injectable, inject } from "inversify";
import { TYPES } from "../types";
import { SupabaseService } from "./supabase.service";
import { PaymentService } from "./payment.service";
import {
  VolumeOrder,
  OrderStatus,
  IVolumeOrderService,
  PoolType,
} from "../interfaces";
import { Keypair } from "@solana/web3.js";
// import { v4 as uuidv4 } from 'uuid'; // Unused
// import * as crypto from 'crypto'; // Unused
const { hkdf } = require("@panva/hkdf");
import { walletMasterSeed } from "../config";

@injectable()
export class VolumeOrderService implements IVolumeOrderService {
  private supabaseService: SupabaseService;
  private paymentService: PaymentService;

  constructor(
    @inject(TYPES.SupabaseService) supabaseService: SupabaseService,
    @inject(TYPES.PaymentService) paymentService: PaymentService,
  ) {
    this.supabaseService = supabaseService;
    this.paymentService = paymentService;
  }

  async createOrder(
    orderData: Pick<
      VolumeOrder,
      | "user_id"
      | "token_address"
      | "pool_address"
      | "volume_target"
      | "duration_hours"
    > &
      Partial<VolumeOrder>,
  ): Promise<VolumeOrder> {
    // Calculate order costs
    const costData = await this.paymentService.calculateOrderCost(
      orderData.volume_target,
      orderData.duration_hours,
    );

    // Create the order first to get the ID
    const draftOrderData: Omit<
      VolumeOrder,
      "id" | "created_at" | "updated_at"
    > = {
      user_id: orderData.user_id,
      username: orderData.username,
      token_address: orderData.token_address,
      pool_address: orderData.pool_address,
      pool_type: this.detectPoolType(orderData.pool_address),
      volume_target: orderData.volume_target,
      duration_hours: orderData.duration_hours,
      tasks_count: costData.tasksCount,
      cost_per_task: costData.costPerTask,
      total_cost: costData.totalCost,
      status: orderData.status || OrderStatus.PENDING_PAYMENT,
      payment_address: "TEMP", // Temporary, will be updated
      payment_signature: orderData.payment_signature,
    };

    const order = await this.supabaseService.createVolumeOrder(draftOrderData);

    // Now generate deterministic payment address from order.id
    const paymentAddress = await this.derivePaymentAddress(order.id);

    // Update order with the correct payment address
    await this.supabaseService.updateVolumeOrder(order.id, {
      payment_address: paymentAddress,
    });

    console.log(
      `🔑 Generated deterministic payment address for order ${order.id.substring(0, 8)}: ${paymentAddress}`,
    );

    return { ...order, payment_address: paymentAddress };
  }

  async getOrder(orderId: string): Promise<VolumeOrder | null> {
    return await this.supabaseService.getVolumeOrder(orderId);
  }

  async updateOrder(
    orderId: string,
    updates: Partial<VolumeOrder>,
  ): Promise<void> {
    console.log(`🔄 updateOrder called for ${orderId} with updates:`, updates);
    await this.supabaseService.updateVolumeOrder(orderId, updates);
    console.log(`✅ updateOrder completed for ${orderId}`);
  }

  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
    const updates: Partial<VolumeOrder> = { status };

    // Set timestamps based on status
    if (status === OrderStatus.RUNNING) {
      updates.started_at = new Date().toISOString();
    } else if (
      status === OrderStatus.COMPLETED ||
      status === OrderStatus.CANCELLED ||
      status === OrderStatus.FAILED
    ) {
      updates.completed_at = new Date().toISOString();
    }

    await this.supabaseService.updateVolumeOrder(orderId, updates);
  }

  async getUserOrders(userId: string): Promise<VolumeOrder[]> {
    return await this.supabaseService.getUserOrders(userId);
  }

  /**
   * Get or create a draft order for the user
   * Reuses existing unexpired draft orders or creates a new one
   */
  async getOrCreateDraftOrder(
    userId: string,
    username?: string,
  ): Promise<VolumeOrder> {
    console.log(`🔍 Looking for existing draft order for user: ${userId}`);

    // First, clean up expired draft orders
    await this.cleanupExpiredDraftOrders(userId);

    // Look for existing active draft order
    const existingDraft = await this.supabaseService.getUserDraftOrder(userId);

    if (existingDraft) {
      console.log(`♻️ Reusing existing draft order: ${existingDraft.id}`);
      // Extend expiration by 30 minutes
      const newExpiration = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await this.supabaseService.updateVolumeOrder(existingDraft.id, {
        expires_at: newExpiration,
        updated_at: new Date().toISOString(),
      });
      return { ...existingDraft, expires_at: newExpiration };
    }

    // Create new draft order
    console.log(`🆕 Creating new draft order for user: ${userId}`);
    const draftOrder = await this.createDraftOrder(userId, username);
    console.log(`✅ Created new draft order: ${draftOrder.id}`);
    return draftOrder;
  }

  /**
   * Create a new draft order with placeholder values
   */
  private async createDraftOrder(
    userId: string,
    username?: string,
  ): Promise<VolumeOrder> {
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes from now

    const draftOrderData: Omit<
      VolumeOrder,
      "id" | "created_at" | "updated_at"
    > = {
      user_id: userId,
      username: username,
      token_address: "PENDING",
      pool_address: "PENDING",
      pool_type: "RAYDIUM" as any,
      volume_target: 0, // Will be set when user selects
      duration_hours: 0, // Will be set when user selects
      tasks_count: 0,
      cost_per_task: 0,
      total_cost: 0,
      status: OrderStatus.PENDING_PAYMENT,
      payment_address: "TEMP", // Will be derived after creation
      expires_at: expiresAt,
    };

    const order = await this.supabaseService.createVolumeOrder(draftOrderData);

    // Derive and update payment address
    const paymentAddress = await this.derivePaymentAddress(order.id);
    const updatedOrder = await this.supabaseService.updateVolumeOrder(
      order.id,
      {
        payment_address: paymentAddress,
      },
    );

    return { ...order, payment_address: paymentAddress };
  }

  /**
   * Clean up expired draft orders for a user
   */
  private async cleanupExpiredDraftOrders(userId: string): Promise<void> {
    try {
      console.log(`🧹 Cleaning up expired draft orders for user: ${userId}`);
      await this.supabaseService.expireOldDraftOrders(userId);
      console.log(`✅ Expired draft orders cleaned up`);
    } catch (error) {
      console.warn(`⚠️ Failed to cleanup expired orders:`, error);
      // Don't throw - this is cleanup, not critical
    }
  }

  async updatePaymentSignature(
    orderId: string,
    signature: string,
  ): Promise<void> {
    await this.supabaseService.updateVolumeOrder(orderId, {
      payment_signature: signature,
      status: OrderStatus.PAYMENT_CONFIRMED,
    });
  }

  async getPendingOrders(): Promise<VolumeOrder[]> {
    // Get orders that are payment confirmed and ready to start volume generation
    return await this.supabaseService.getOrdersByStatus(
      OrderStatus.PAYMENT_CONFIRMED,
    );
  }

  async deleteOrder(orderId: string): Promise<void> {
    // Delete order and cascade to tasks (handled by DB foreign key)
    await this.supabaseService.deleteVolumeOrder(orderId);
  }

  async getOrderProgress(orderId: string): Promise<{
    totalVolume: number;
    completedTasks: number;
    runningTasks: number;
  }> {
    return await this.supabaseService.getOrderProgress(orderId);
  }

  /**
   * Derive payment keypair from order ID using HKDF
   * This is the same method used by the sweeper to reconstruct keys
   */
  async derivePaymentKeypair(orderId: string): Promise<Keypair> {
    if (!walletMasterSeed) {
      throw new Error("WALLET_MASTER_SEED not configured");
    }

    // Convert master seed from hex to bytes
    const masterSeedBytes = Buffer.from(walletMasterSeed, "hex");

    // Derive child seed using HKDF (await the result)
    const childSeed = await hkdf(
      "sha256",
      masterSeedBytes,
      Buffer.from(orderId),
      "pricegoupbot:payment",
      32,
    );

    // Ensure childSeed is a Uint8Array for Solana Keypair
    const seedArray = new Uint8Array(childSeed);

    // Generate keypair from derived seed
    const { Keypair } = require("@solana/web3.js");
    return Keypair.fromSeed(seedArray);
  }

  /**
   * Get payment address from order ID (public key only)
   */
  async derivePaymentAddress(orderId: string): Promise<string> {
    const keypair = await this.derivePaymentKeypair(orderId);
    return keypair.publicKey.toString();
  }

  private detectPoolType(poolAddress: string): PoolType {
    // Simple detection based on known pool patterns
    // In production, you'd query the actual pool to determine its type
    if (poolAddress.length === 44) {
      // Most Raydium pools are 44 characters
      return PoolType.RAYDIUM;
    }
    return PoolType.RAYDIUM; // Default to Raydium
  }
}
