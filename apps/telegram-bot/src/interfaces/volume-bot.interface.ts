// Volume Bot Order Status
export enum OrderStatus {
  PENDING_PAYMENT = "pending_payment",
  PAYMENT_CONFIRMED = "payment_confirmed",
  RUNNING = "running",
  PAUSED = "paused",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  FAILED = "failed",
  EXPIRED = "expired",
}

// Volume Task Status
export enum TaskStatus {
  PENDING = "pending",
  RUNNING = "running",
  PAUSED = "paused",
  COMPLETED = "completed",
  FAILED = "failed",
}

// Liquidity Pool Type
export enum PoolType {
  RAYDIUM = "raydium",
  ORCA = "orca",
  JUPITER = "jupiter",
}

// Database Schema Interfaces
export interface VolumeOrder {
  id: string;
  user_id: string;
  username?: string;
  token_address: string;
  pool_address: string;
  pool_type: PoolType;
  volume_target: number; // USD
  duration_hours: number;
  tasks_count: number;
  cost_per_task: number; // SOL
  total_cost: number; // SOL
  status: OrderStatus;
  payment_address: string;
  payment_signature?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  expires_at?: string;
}

export interface VolumeTask {
  id: string;
  order_id: string;
  wallet_address: string;
  status: TaskStatus;
  target_volume: number; // USD
  current_volume: number; // USD
  interval_minutes: number;
  cycles_completed: number;
  total_cycles: number;
  last_transaction_at?: string;
  created_at: string;
  updated_at: string;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  market_cap?: number;
  price?: number;
  created_at: string;
  updated_at: string;
}

export interface LiquidityPool {
  address: string;
  token_a: string;
  token_b: string;
  pool_type: PoolType;
  liquidity_usd: number;
  volume_24h?: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  task_id: string;
  signature: string;
  type: "buy" | "sell";
  amount_sol: number;
  amount_tokens: number;
  price: number;
  created_at: string;
}

// Bot State Management
export interface UserSession {
  userId: string;
  currentStep: string;
  selectedVolume?: number;
  selectedDuration?: number;
  tokenAddress?: string;
  selectedPool?: string;
  orderData?: Partial<VolumeOrder>;
}

// Service Interfaces
export interface IVolumeOrderService {
  createOrder(orderData: Partial<VolumeOrder>): Promise<VolumeOrder>;
  getOrder(orderId: string): Promise<VolumeOrder | null>;
  updateOrderStatus(orderId: string, status: OrderStatus): Promise<void>;
  getUserOrders(userId: string): Promise<VolumeOrder[]>;
}

export interface ISolanaService {
  validateTokenAddress(address: string): Promise<boolean>;
  getTokenInfo(address: string): Promise<TokenInfo | null>;
  getLiquidityPools(tokenAddress: string): Promise<LiquidityPool[]>;
  generatePaymentAddress(): Promise<string>;
  verifyPayment(
    address: string,
    expectedAmount: number,
  ): Promise<string | null>;
}

export interface IVolumeEngineService {
  startVolumeGeneration(orderId: string): Promise<void>;
  stopVolumeGeneration(orderId: string): Promise<void>;
  getOrderProgress(orderId: string): Promise<{
    totalVolume: number;
    completedTasks: number;
    runningTasks: number;
  }>;
}

export interface IPaymentService {
  generateQRCode(address: string, amount: number): Promise<string>;
  calculateOrderCost(
    volume: number,
    duration: number,
  ): Promise<{
    tasksCount: number;
    costPerTask: number;
    totalCost: number;
  }>;
}
