import { injectable } from "inversify";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl, supabaseKey, supabaseServiceKey } from "../config";
import {
  VolumeOrder,
  VolumeTask,
  TokenInfo,
  LiquidityPool,
  Transaction,
} from "../interfaces";

@injectable()
export class SupabaseService {
  private client: SupabaseClient;

  constructor() {
    if (!supabaseUrl) {
      throw new Error("Supabase URL is required");
    }

    // Use service role key if available (for bot operations), otherwise use anon key
    const key = supabaseServiceKey || supabaseKey;
    if (!key) {
      throw new Error("Supabase service role key or anon key is required");
    }

    this.client = createClient(supabaseUrl, key);
    console.log(
      `🔑 Supabase client initialized with ${supabaseServiceKey ? "service role" : "anon"} key`,
    );
  }

  // Volume Orders
  async createVolumeOrder(
    order: Omit<VolumeOrder, "id" | "created_at" | "updated_at">,
  ): Promise<VolumeOrder> {
    const { data, error } = await this.client
      .from("volume_orders")
      .insert(order)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getVolumeOrder(orderId: string): Promise<VolumeOrder | null> {
    const { data, error } = await this.client
      .from("volume_orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data;
  }

  async updateVolumeOrder(
    orderId: string,
    updates: Partial<VolumeOrder>,
  ): Promise<void> {
    console.log(`🔄 updateVolumeOrder: ${orderId}`, updates);
    const updateData = { ...updates, updated_at: new Date().toISOString() };
    console.log(`📝 Supabase update data:`, updateData);

    const { error } = await this.client
      .from("volume_orders")
      .update(updateData)
      .eq("id", orderId);

    if (error) {
      console.error(`❌ Supabase updateVolumeOrder error:`, error);
      throw error;
    }
    console.log(`✅ updateVolumeOrder completed for ${orderId}`);
  }

  async getUserOrders(userId: string): Promise<VolumeOrder[]> {
    const { data, error } = await this.client
      .from("volume_orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getOrdersByStatus(status: string): Promise<VolumeOrder[]> {
    const { data, error } = await this.client
      .from("volume_orders")
      .select("*")
      .eq("status", status)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async deleteVolumeOrder(orderId: string): Promise<void> {
    const { error } = await this.client
      .from("volume_orders")
      .delete()
      .eq("id", orderId);

    if (error) throw error;
  }

  // Volume Tasks
  async createVolumeTasks(
    tasks: Omit<VolumeTask, "id" | "created_at" | "updated_at">[],
  ): Promise<VolumeTask[]> {
    const { data, error } = await this.client
      .from("volume_tasks")
      .insert(tasks)
      .select();

    if (error) throw error;
    return data;
  }

  async getOrderTasks(orderId: string): Promise<VolumeTask[]> {
    const { data, error } = await this.client
      .from("volume_tasks")
      .select("*")
      .eq("order_id", orderId);

    if (error) throw error;
    return data || [];
  }

  async updateVolumeTask(
    taskId: string,
    updates: Partial<VolumeTask>,
  ): Promise<void> {
    const { error } = await this.client
      .from("volume_tasks")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", taskId);

    if (error) throw error;
  }

  // Token Info
  async upsertTokenInfo(
    tokenInfo: Omit<TokenInfo, "created_at" | "updated_at">,
  ): Promise<TokenInfo> {
    const { data, error } = await this.client
      .from("token_info")
      .upsert(tokenInfo, { onConflict: "address" })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getTokenInfo(address: string): Promise<TokenInfo | null> {
    const { data, error } = await this.client
      .from("token_info")
      .select("*")
      .eq("address", address)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data;
  }

  // Liquidity Pools
  async upsertLiquidityPool(
    pool: Omit<LiquidityPool, "created_at" | "updated_at">,
  ): Promise<LiquidityPool> {
    const { data, error } = await this.client
      .from("liquidity_pools")
      .upsert(pool, { onConflict: "address" })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getTokenPools(tokenAddress: string): Promise<LiquidityPool[]> {
    const { data, error } = await this.client
      .from("liquidity_pools")
      .select("*")
      .or(`token_a.eq.${tokenAddress},token_b.eq.${tokenAddress}`)
      .order("liquidity_usd", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async deleteTokenPools(tokenAddress: string): Promise<void> {
    const { error } = await this.client
      .from("liquidity_pools")
      .delete()
      .or(`token_a.eq.${tokenAddress},token_b.eq.${tokenAddress}`);

    if (error) throw error;
  }

  // Transactions
  async createTransaction(
    transaction: Omit<Transaction, "id" | "created_at">,
  ): Promise<Transaction> {
    const { data, error } = await this.client
      .from("transactions")
      .insert(transaction)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getTaskTransactions(taskId: string): Promise<Transaction[]> {
    const { data, error } = await this.client
      .from("transactions")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // Analytics
  async getOrderProgress(orderId: string): Promise<{
    totalVolume: number;
    completedTasks: number;
    runningTasks: number;
  }> {
    const tasks = await this.getOrderTasks(orderId);

    const totalVolume = tasks.reduce(
      (sum, task) => sum + task.current_volume,
      0,
    );
    const completedTasks = tasks.filter(
      (task) => task.status === "completed",
    ).length;
    const runningTasks = tasks.filter(
      (task) => task.status === "running",
    ).length;

    return {
      totalVolume,
      completedTasks,
      runningTasks,
    };
  }
}
