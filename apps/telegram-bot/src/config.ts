import dotenv from 'dotenv';

// Load .env first, then override with .env.local if present
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v || v.length === 0) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return v;
}

// Telegram Bot Configuration
export const botToken = process.env.BOT_TOKEN;

// Supabase Configuration
export const supabaseUrl = process.env.SUPABASE_URL;
export const supabaseKey = process.env.SUPABASE_ANON_KEY;
export const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Solana Configuration
export const solanaRpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
export const paymentWalletAddress = process.env.PAYMENT_WALLET_ADDRESS;

// Treasury / Sweeping / Fees
export const walletMasterSeed = process.env.WALLET_MASTER_SEED; // 32-byte seed (hex/base58)
export const treasuryFeesAddress = process.env.TREASURY_FEES_ADDRESS;
export const treasuryOpsAddress = process.env.TREASURY_OPERATIONS_ADDRESS;
export const feeBps = process.env.FEE_BPS ? parseInt(process.env.FEE_BPS, 10) : undefined;
export const minSweepLamports = process.env.MIN_SWEEP_LAMPORTS ? parseInt(process.env.MIN_SWEEP_LAMPORTS, 10) : undefined;

// Secrets for cron endpoints
export const sweeperSecret = process.env.SWEEPER_SECRET;
export const volumeProcessorSecret = process.env.VOLUME_PROCESSOR_SECRET;

// Volume Bot Configuration
export const volumeBotSettings = {
  // Volume packages in USD
  volumePackages: [75000, 150000, 300000, 500000, 1000000, 2000000, 5000000, 10000000],
  // Duration options in hours
  durations: [6, 12, 24, 72, 168], // 6h, 12h, 24h, 3 days, 7 days
  // Base cost per task in SOL
  baseCostPerTask: 1.5,
  // Swap fee percentage (Raydium default)
  swapFee: 0.0025,
  // Number of buy/sell cycles per task
  cyclesPerTask: 5, // 3 buys, 2 sells
};

// Helper to validate critical envs at startup (optional – uncomment to enforce)
// export function validateCriticalEnv() {
//   requireEnv('SUPABASE_URL');
//   requireEnv('SUPABASE_SERVICE_ROLE_KEY');
//   requireEnv('SOLANA_RPC_URL');
//   requireEnv('WALLET_MASTER_SEED');
//   requireEnv('TREASURY_FEES_ADDRESS');
//   requireEnv('TREASURY_OPERATIONS_ADDRESS');
//   requireEnv('SWEEPER_SECRET');
// }