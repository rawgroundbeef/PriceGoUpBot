import { SweeperService } from "../../services/sweeper.service";
import { SupabaseService } from "../../services/supabase.service";
import { VolumeOrderService } from "../../services/volume-order.service";
import { PaymentService } from "../../services/payment.service";
import { OrderStatus } from "../../interfaces";

// Mock dependencies
jest.mock("../../services/supabase.service");
jest.mock("../../services/volume-order.service");

describe("SweeperService", () => {
  let sweeperService: SweeperService;
  let mockSupabaseService: jest.Mocked<SupabaseService>;
  let mockVolumeOrderService: jest.Mocked<VolumeOrderService>;

  beforeEach(() => {
    // Set required environment variables for testing
    process.env.SOLANA_RPC_URL = "https://api.devnet.solana.com";
    process.env.TREASURY_FEES_ADDRESS =
      "CWzw6YZsviyGa4grk3H3rK3GoGv9kCDrbQ5LYS5SSMk6";
    process.env.TREASURY_OPERATIONS_ADDRESS =
      "4LFQiTYDoAwRJjABXArGAGPjNSZiumoFWT5uUssK9MFY";
    process.env.FEE_BPS = "500";
    process.env.MIN_SWEEP_LAMPORTS = "1000000";

    mockSupabaseService = new SupabaseService() as jest.Mocked<SupabaseService>;
    mockVolumeOrderService = new VolumeOrderService(
      mockSupabaseService,
      {} as unknown as PaymentService,
    ) as jest.Mocked<VolumeOrderService>;

    sweeperService = new SweeperService(
      mockSupabaseService,
      mockVolumeOrderService,
    );
  });

  describe("sweepAllPendingPayments", () => {
    it("should process orders with different statuses", async () => {
      const mockOrders = [
        {
          id: "order-1",
          status: OrderStatus.PENDING_PAYMENT,
          payment_address: "address1",
          total_cost: 1.5,
          payment_signature: null,
        },
        {
          id: "order-2",
          status: OrderStatus.PAYMENT_CONFIRMED,
          payment_address: "address2",
          total_cost: 3.0,
          payment_signature: null,
        },
      ];

      mockSupabaseService.getOrdersByStatus = jest
        .fn()
        .mockResolvedValueOnce([mockOrders[0]]) // PENDING_PAYMENT
        .mockResolvedValueOnce([mockOrders[1]]) // PAYMENT_CONFIRMED
        .mockResolvedValueOnce([]); // RUNNING

      mockSupabaseService.getVolumeOrder = jest
        .fn()
        .mockResolvedValue(mockOrders[0]);

      // Mock keypair derivation to fail (simulating legacy orders)
      mockVolumeOrderService.derivePaymentKeypair = jest
        .fn()
        .mockRejectedValue(new Error("Cannot derive"));

      const result = await sweeperService.sweepAllPendingPayments();

      expect(result.processed).toBe(2);
      expect(result.swept).toBe(0); // Failed due to key derivation
      expect(result.errors.length).toBe(2);
    });

    it("should skip already swept orders", async () => {
      const mockOrder = {
        id: "order-1",
        status: OrderStatus.RUNNING,
        payment_signature: "fees:abc123,ops:def456", // Already swept
      };

      mockSupabaseService.getOrdersByStatus = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockOrder]);

      mockSupabaseService.getVolumeOrder = jest
        .fn()
        .mockResolvedValue(mockOrder);

      const result = await sweeperService.sweepAllPendingPayments();

      expect(result.processed).toBe(1);
      expect(result.swept).toBe(0); // Skipped due to existing sweep
    });
  });

  describe("sweepOrderPayment", () => {
    it("should return false for non-existent order", async () => {
      mockSupabaseService.getVolumeOrder = jest.fn().mockResolvedValue(null);

      const result =
        await sweeperService.sweepOrderPayment("non-existent-order");

      expect(result).toBe(false);
    });

    it("should return false for already completed order", async () => {
      const mockOrder = {
        id: "order-1",
        status: OrderStatus.COMPLETED,
      };

      mockSupabaseService.getVolumeOrder = jest
        .fn()
        .mockResolvedValue(mockOrder);

      const result = await sweeperService.sweepOrderPayment("order-1");

      expect(result).toBe(false);
    });
  });
});
