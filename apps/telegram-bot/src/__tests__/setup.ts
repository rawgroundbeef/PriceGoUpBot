// Jest setup file
import "reflect-metadata";
import dotenv from "dotenv";

// Load test environment variables
dotenv.config({ path: ".env.test" });
dotenv.config({ path: ".env.local", override: true });

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
