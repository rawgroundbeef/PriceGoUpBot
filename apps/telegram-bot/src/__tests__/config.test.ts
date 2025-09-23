import {
  validateEnvironment,
  volumeBotSettings,
  FEE_BPS,
  MIN_SWEEP_LAMPORTS,
} from "../config";

describe("Configuration", () => {
  describe("validateEnvironment", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it("should throw error when required env vars are missing", () => {
      delete process.env.BOT_TOKEN;

      expect(() => validateEnvironment()).toThrow(
        "Missing required environment variable: BOT_TOKEN",
      );
    });

    it("should validate successfully when all required vars are present", () => {
      process.env.BOT_TOKEN = "test-token";
      process.env.SUPABASE_URL = "test-url";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
      process.env.WALLET_MASTER_SEED = "test-seed";
      process.env.TREASURY_FEES_ADDRESS = "test-fees-address";
      process.env.TREASURY_OPERATIONS_ADDRESS = "test-ops-address";
      process.env.CRON_SECRET = "test-cron-secret";

      expect(() => validateEnvironment()).not.toThrow();
    });
  });

  describe("Volume Bot Settings", () => {
    it("should have correct volume packages", () => {
      expect(volumeBotSettings.volumePackages).toEqual([
        75000, 150000, 300000, 500000, 1000000, 2000000, 5000000, 10000000,
      ]);
    });

    it("should have correct duration options", () => {
      expect(volumeBotSettings.durations).toEqual([6, 12, 24, 72, 168]);
    });

    it("should have correct base cost per task", () => {
      expect(volumeBotSettings.baseCostPerTask).toBe(1.5);
    });
  });

  describe("Fee Configuration", () => {
    it("should have default fee of 5%", () => {
      expect(FEE_BPS).toBe(500); // 5% = 500 basis points
    });

    it("should have default minimum sweep amount", () => {
      expect(MIN_SWEEP_LAMPORTS).toBe(1000000); // 0.001 SOL
    });
  });
});
