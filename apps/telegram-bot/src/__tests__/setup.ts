// Jest setup file
import "reflect-metadata";
import dotenv from "dotenv";

// Load test environment variables
dotenv.config({ path: ".env.test" });
dotenv.config({ path: ".env.local", override: true });

// Set up required environment variables for tests
process.env.BOT_TOKEN = process.env.BOT_TOKEN || "test-bot-token";
process.env.SUPABASE_URL =
  process.env.SUPABASE_URL || "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
process.env.WALLET_MASTER_SEED =
  process.env.WALLET_MASTER_SEED ||
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.TREASURY_FEES_ADDRESS =
  process.env.TREASURY_FEES_ADDRESS || "11111111111111111111111111111111";
process.env.TREASURY_OPERATIONS_ADDRESS =
  process.env.TREASURY_OPERATIONS_ADDRESS || "22222222222222222222222222222222";
process.env.CRON_SECRET = process.env.CRON_SECRET || "test-cron-secret";
process.env.SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// Mock external dependencies for testing
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      upsert: jest.fn().mockReturnThis(),
    })),
  })),
}));

// Mock Solana connection for testing
jest.mock("@solana/web3.js", () => ({
  ...jest.requireActual("@solana/web3.js"),
  Connection: jest.fn(() => ({
    getBalance: jest.fn().mockResolvedValue(0),
    getAccountInfo: jest.fn().mockResolvedValue(null),
    getSignaturesForAddress: jest.fn().mockResolvedValue([]),
    getTransaction: jest.fn().mockResolvedValue(null),
    getLatestBlockhash: jest
      .fn()
      .mockResolvedValue({ blockhash: "test-blockhash" }),
    sendRawTransaction: jest.fn().mockResolvedValue("test-signature"),
    confirmTransaction: jest.fn().mockResolvedValue(true),
    sendTransaction: jest.fn().mockResolvedValue("test-signature"),
    getParsedTokenAccountsByOwner: jest.fn().mockResolvedValue({ value: [] }),
  })),
}));

// Mock Jupiter API for testing
jest.mock("@jup-ag/api", () => ({
  createJupiterApiClient: jest.fn(() => ({
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
  })),
}));

// Mock fetch for external API calls
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  }),
) as jest.Mock;

// Console log suppression for cleaner test output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeEach(() => {
  // Suppress console logs in tests unless VERBOSE_TESTS is set
  if (!process.env.VERBOSE_TESTS) {
    console.log = jest.fn();
    console.error = jest.fn();
  }
});

afterEach(() => {
  // Restore console logs
  console.log = originalConsoleLog;
  console.error = originalConsoleError;

  // Clear all mocks
  jest.clearAllMocks();
});
