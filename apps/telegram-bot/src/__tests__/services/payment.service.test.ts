import { PaymentService } from "../../services/payment.service";

describe("PaymentService", () => {
  let paymentService: PaymentService;

  beforeEach(() => {
    paymentService = new PaymentService();
  });

  describe("calculateOrderCost", () => {
    it("should calculate correct cost for $75K 24h order", async () => {
      const result = await paymentService.calculateOrderCost(75000, 24);

      expect(result.tasksCount).toBeGreaterThan(0);
      expect(result.costPerTask).toBe(1.5);
      expect(result.totalCost).toBe(result.tasksCount * 1.5);
    });

    it("should calculate more tasks for higher volume", async () => {
      const lowVolume = await paymentService.calculateOrderCost(75000, 24);
      const highVolume = await paymentService.calculateOrderCost(1000000, 24);

      expect(highVolume.tasksCount).toBeGreaterThan(lowVolume.tasksCount);
      expect(highVolume.totalCost).toBeGreaterThan(lowVolume.totalCost);
    });

    it("should calculate more tasks for shorter duration", async () => {
      const longDuration = await paymentService.calculateOrderCost(
        1000000,
        168,
      ); // 7 days
      const shortDuration = await paymentService.calculateOrderCost(1000000, 6); // 6 hours

      expect(shortDuration.tasksCount).toBeGreaterThan(longDuration.tasksCount);
    });

    it("should always have at least 1 task", async () => {
      const result = await paymentService.calculateOrderCost(75000, 168);

      expect(result.tasksCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("generateQRCode", () => {
    it("should generate QR code for payment", async () => {
      const address = "CWzw6YZsviyGa4grk3H3rK3GoGv9kCDrbQ5LYS5SSMk6";
      const amount = 1.5;

      const qrCode = await paymentService.generateQRCode(address, amount);

      expect(typeof qrCode).toBe("string");
      expect(qrCode.length).toBeGreaterThan(0);
    });

    it("should generate QR code even for invalid address format", async () => {
      // QR code generation doesn't validate Solana address format
      // It just creates a QR code with the provided data
      const invalidAddress = "invalid-address";
      const amount = 1.5;

      const qrCode = await paymentService.generateQRCode(
        invalidAddress,
        amount,
      );

      expect(typeof qrCode).toBe("string");
      expect(qrCode.length).toBeGreaterThan(0);
    });
  });

  describe("getVolumePricingTiers", () => {
    it("should return pricing tiers for all volume packages", () => {
      const tiers = paymentService.getVolumePricingTiers();

      expect(tiers).toHaveLength(8); // 8 volume packages
      expect(tiers[0].volume).toBe(75000);
      expect(tiers[4].volume).toBe(1000000); // $1M package

      // Each tier should have required properties
      tiers.forEach((tier) => {
        expect(tier).toHaveProperty("volume");
        expect(tier).toHaveProperty("formattedVolume");
        expect(tier).toHaveProperty("estimatedTasks");
        expect(tier).toHaveProperty("estimatedCost");
      });
    });
  });
});
