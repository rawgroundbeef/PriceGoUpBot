import { JupiterTradingService } from "../../services/jupiter-trading.service";

// Mock all dependencies
jest.mock("@jup-ag/api");
jest.mock("@solana/web3.js");

describe("JupiterTradingService", () => {
  let service: JupiterTradingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new JupiterTradingService();
  });

  describe("Service Initialization", () => {
    it("should initialize without errors", () => {
      expect(service).toBeInstanceOf(JupiterTradingService);
    });

    it("should have required methods", () => {
      expect(typeof service.executeBuy).toBe("function");
      expect(typeof service.executeSell).toBe("function");
      expect(typeof service.getTokenBalance).toBe("function");
      expect(typeof service.getSolBalance).toBe("function");
      expect(typeof service.fundTradingWallet).toBe("function");
    });
  });

  describe("Trade Result Interface", () => {
    it("should return proper TradeResult structure for successful trade", async () => {
      // Mock successful Jupiter response
      const mockJupiterApi = {
        quoteGet: jest.fn().mockResolvedValue({
          inputMint: "So11111111111111111111111111111111111111112",
          outputMint: "test-token",
          inAmount: "100000000",
          outAmount: "1000000",
          priceImpactPct: "1.5",
        }),
        swapPost: jest.fn().mockResolvedValue({
          swapTransaction: Buffer.from("mock-transaction").toString("base64"),
        }),
      };

      const mockConnection = {
        sendTransaction: jest.fn().mockResolvedValue("test-signature"),
        confirmTransaction: jest
          .fn()
          .mockResolvedValue({ value: { err: null } }),
      };

      // Override internal properties
      (service as unknown as { jupiterApi: unknown }).jupiterApi =
        mockJupiterApi;
      (service as unknown as { connection: unknown }).connection =
        mockConnection;

      const mockKeypair = {
        publicKey: { toString: () => "mock-pubkey" },
        secretKey: new Uint8Array(64),
      } as unknown as import("@solana/web3.js").Keypair;

      const result = await service.executeBuy(
        mockKeypair,
        "test-token",
        100000000,
        300,
      );

      // Should have proper TradeResult structure
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("amountIn");
      expect(typeof result.success).toBe("boolean");
      expect(typeof result.amountIn).toBe("number");

      if (result.success) {
        expect(result).toHaveProperty("signature");
        expect(result).toHaveProperty("amountOut");
        expect(result).toHaveProperty("priceImpact");
      } else {
        expect(result).toHaveProperty("error");
      }
    });

    it("should return proper error structure for failed trade", async () => {
      // Mock failed Jupiter response
      const mockJupiterApi = {
        quoteGet: jest.fn().mockResolvedValue(null), // No quote available
      };

      (service as unknown as { jupiterApi: unknown }).jupiterApi =
        mockJupiterApi;

      const mockKeypair = {
        publicKey: { toString: () => "mock-pubkey" },
        secretKey: new Uint8Array(64),
      } as unknown as import("@solana/web3.js").Keypair;

      const result = await service.executeBuy(
        mockKeypair,
        "test-token",
        100000000,
        300,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("No quote available");
      expect(result.amountIn).toBe(100000000);
      expect(result.signature).toBeUndefined();
    });
  });

  describe("Balance Checking", () => {
    it("should handle balance queries safely", async () => {
      const mockConnection = {
        getBalance: jest.fn().mockResolvedValue(500000000),
        getParsedTokenAccountsByOwner: jest
          .fn()
          .mockResolvedValue({ value: [] }),
      };

      (service as unknown as { connection: unknown }).connection =
        mockConnection;

      const mockPubkey = {
        toString: () => "mock-pubkey",
      } as unknown as import("@solana/web3.js").PublicKey;

      // Test SOL balance
      const solBalance = await service.getSolBalance(mockPubkey);
      expect(typeof solBalance).toBe("number");
      expect(solBalance).toBeGreaterThanOrEqual(0);

      // Test token balance
      const tokenBalance = await service.getTokenBalance(
        mockPubkey,
        "test-token",
      );
      expect(typeof tokenBalance).toBe("number");
      expect(tokenBalance).toBeGreaterThanOrEqual(0);
    });
  });
});
