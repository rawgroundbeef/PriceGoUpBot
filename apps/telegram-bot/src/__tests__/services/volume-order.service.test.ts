import { VolumeOrderService } from "../../services/volume-order.service";
import { SupabaseService } from "../../services/supabase.service";
import { PaymentService } from "../../services/payment.service";
import { OrderStatus, PoolType } from "../../interfaces";

// Mock dependencies
jest.mock("../../services/supabase.service");
jest.mock("../../services/payment.service");
jest.mock("@jup-ag/api");
jest.mock("@solana/web3.js");

describe("VolumeOrderService", () => {
  let volumeOrderService: VolumeOrderService;
  let mockSupabaseService: jest.Mocked<SupabaseService>;
  let mockPaymentService: jest.Mocked<PaymentService>;

  beforeEach(() => {
    mockSupabaseService = new SupabaseService() as jest.Mocked<SupabaseService>;
    mockPaymentService = new PaymentService() as jest.Mocked<PaymentService>;

    // Mock payment service methods
    mockPaymentService.calculateOrderCost = jest.fn().mockResolvedValue({
      tasksCount: 12,
      costPerTask: 1.5,
      totalCost: 18.0,
    });

    volumeOrderService = new VolumeOrderService(
      mockSupabaseService,
      mockPaymentService,
    );
  });

  describe("derivePaymentAddress", () => {
    it("should generate deterministic address from order ID", async () => {
      // Mock WALLET_MASTER_SEED
      process.env.WALLET_MASTER_SEED =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      const orderId = "test-order-id-123";
      const address1 = await volumeOrderService.derivePaymentAddress(orderId);
      const address2 = await volumeOrderService.derivePaymentAddress(orderId);

      expect(address1).toBe(address2); // Should be deterministic
      expect(address1).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/); // Valid Solana address format
    });

    it("should generate different addresses for different order IDs", async () => {
      process.env.WALLET_MASTER_SEED =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      const address1 = await volumeOrderService.derivePaymentAddress("order-1");
      const address2 = await volumeOrderService.derivePaymentAddress("order-2");

      expect(address1).not.toBe(address2);
    });
  });

  describe("createOrder", () => {
    it("should create order with HKDF-derived payment address", async () => {
      const mockOrder = {
        id: "test-order-id",
        user_id: "123456789",
        username: "testuser",
        token_address: "PENDING",
        pool_address: "PENDING",
        volume_target: 1000000,
        duration_hours: 24,
        status: OrderStatus.PENDING_PAYMENT,
        payment_address: "TEMP",
        tasks_count: 12,
        cost_per_task: 1.5,
        total_cost: 18.0,
        pool_type: PoolType.RAYDIUM,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockSupabaseService.createVolumeOrder = jest
        .fn()
        .mockResolvedValue(mockOrder);
      mockSupabaseService.updateVolumeOrder = jest
        .fn()
        .mockResolvedValue(undefined);

      const orderData = {
        user_id: "123456789",
        username: "testuser",
        token_address: "PENDING",
        pool_address: "PENDING",
        volume_target: 1000000,
        duration_hours: 24,
      };

      const result = await volumeOrderService.createOrder(orderData);

      expect(mockSupabaseService.createVolumeOrder).toHaveBeenCalled();
      expect(mockSupabaseService.updateVolumeOrder).toHaveBeenCalled();
      expect(result.payment_address).not.toBe("TEMP");
      expect(result.payment_address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    });
  });

  describe("updateOrderStatus", () => {
    it("should set started_at when status changes to RUNNING", async () => {
      const orderId = "test-order-id";

      await volumeOrderService.updateOrderStatus(orderId, OrderStatus.RUNNING);

      expect(mockSupabaseService.updateVolumeOrder).toHaveBeenCalledWith(
        orderId,
        expect.objectContaining({
          status: OrderStatus.RUNNING,
          started_at: expect.any(String),
        }),
      );
    });

    it("should set completed_at when status changes to COMPLETED", async () => {
      const orderId = "test-order-id";

      await volumeOrderService.updateOrderStatus(
        orderId,
        OrderStatus.COMPLETED,
      );

      expect(mockSupabaseService.updateVolumeOrder).toHaveBeenCalledWith(
        orderId,
        expect.objectContaining({
          status: OrderStatus.COMPLETED,
          completed_at: expect.any(String),
        }),
      );
    });
  });
});
