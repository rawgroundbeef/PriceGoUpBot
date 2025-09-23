import { injectable, inject } from 'inversify';
import { TYPES } from '../types';
import { SupabaseService } from './supabase.service';
import { PaymentService } from './payment.service';
import { VolumeOrder, OrderStatus, IVolumeOrderService, PoolType } from '../interfaces';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
const { hkdf } = require('@panva/hkdf');
import { walletMasterSeed } from '../config';

@injectable()
export class VolumeOrderService implements IVolumeOrderService {
  private supabaseService: SupabaseService;
  private paymentService: PaymentService;

  constructor(
    @inject(TYPES.SupabaseService) supabaseService: SupabaseService,
    @inject(TYPES.PaymentService) paymentService: PaymentService
  ) {
    this.supabaseService = supabaseService;
    this.paymentService = paymentService;
  }

  async createOrder(orderData: Partial<VolumeOrder>): Promise<VolumeOrder> {
    // Calculate order costs
    const costData = await this.paymentService.calculateOrderCost(
      orderData.volume_target!,
      orderData.duration_hours!
    );

    // Create the order first to get the ID
    const draftOrderData: Omit<VolumeOrder, 'id' | 'created_at' | 'updated_at'> = {
      user_id: orderData.user_id!,
      username: orderData.username,
      token_address: orderData.token_address!,
      pool_address: orderData.pool_address!,
      pool_type: this.detectPoolType(orderData.pool_address!),
      volume_target: orderData.volume_target!,
      duration_hours: orderData.duration_hours!,
      tasks_count: costData.tasksCount,
      cost_per_task: costData.costPerTask,
      total_cost: costData.totalCost,
      status: orderData.status || OrderStatus.PENDING_PAYMENT,
      payment_address: 'TEMP', // Temporary, will be updated
      payment_signature: orderData.payment_signature
    };

    const order = await this.supabaseService.createVolumeOrder(draftOrderData);

    // Now generate deterministic payment address from order.id
    const paymentAddress = await this.derivePaymentAddress(order.id);

    // Update order with the correct payment address
    await this.supabaseService.updateVolumeOrder(order.id, {
      payment_address: paymentAddress
    });

    console.log(`🔑 Generated deterministic payment address for order ${order.id.substring(0, 8)}: ${paymentAddress}`);

    return { ...order, payment_address: paymentAddress };
  }

  async getOrder(orderId: string): Promise<VolumeOrder | null> {
    return await this.supabaseService.getVolumeOrder(orderId);
  }

  async updateOrder(orderId: string, updates: Partial<VolumeOrder>): Promise<void> {
    await this.supabaseService.updateVolumeOrder(orderId, updates);
  }

  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
    const updates: Partial<VolumeOrder> = { status };
    
    // Set timestamps based on status
    if (status === OrderStatus.RUNNING) {
      updates.started_at = new Date().toISOString();
    } else if (status === OrderStatus.COMPLETED || status === OrderStatus.CANCELLED || status === OrderStatus.FAILED) {
      updates.completed_at = new Date().toISOString();
    }

    await this.supabaseService.updateVolumeOrder(orderId, updates);
  }

  async getUserOrders(userId: string): Promise<VolumeOrder[]> {
    return await this.supabaseService.getUserOrders(userId);
  }

  async updatePaymentSignature(orderId: string, signature: string): Promise<void> {
    await this.supabaseService.updateVolumeOrder(orderId, {
      payment_signature: signature,
      status: OrderStatus.PAYMENT_CONFIRMED
    });
  }

  async getPendingOrders(): Promise<VolumeOrder[]> {
    // Get orders that are payment confirmed and ready to start volume generation
    return await this.supabaseService.getOrdersByStatus(OrderStatus.PAYMENT_CONFIRMED);
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
  async derivePaymentKeypair(orderId: string): Promise<any> {
    if (!walletMasterSeed) {
      throw new Error('WALLET_MASTER_SEED not configured');
    }

    // Convert master seed from hex to bytes
    const masterSeedBytes = Buffer.from(walletMasterSeed, 'hex');
    
    // Derive child seed using HKDF (await the result)
    const childSeed = await hkdf('sha256', masterSeedBytes, Buffer.from(orderId), 'pricegoupbot:payment', 32);
    
    // Ensure childSeed is a Uint8Array for Solana Keypair
    const seedArray = new Uint8Array(childSeed);
    
    // Generate keypair from derived seed
    const { Keypair } = require('@solana/web3.js');
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
