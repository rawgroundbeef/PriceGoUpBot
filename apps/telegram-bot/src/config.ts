import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../../../.env' }); // Project root
dotenv.config({ path: '../../../.env.local', override: true }); // Project root local
dotenv.config(); // App directory .env
dotenv.config({ path: '.env.local', override: true }); // App directory local

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] || defaultValue;
}

// Telegram Bot Configuration
export const BOT_TOKEN = requireEnv('BOT_TOKEN');

// Supabase Configuration
export const SUPABASE_URL = requireEnv('SUPABASE_URL');
export const SUPABASE_ANON_KEY = getEnv('SUPABASE_ANON_KEY');
export const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

// Solana Configuration
export const SOLANA_RPC_URL = getEnv('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com');

// Treasury & Wallet Configuration
export const WALLET_MASTER_SEED = requireEnv('WALLET_MASTER_SEED');
export const TREASURY_FEES_ADDRESS = requireEnv('TREASURY_FEES_ADDRESS');
export const TREASURY_OPERATIONS_ADDRESS = requireEnv('TREASURY_OPERATIONS_ADDRESS');

// Fee Configuration
export const FEE_BPS = parseInt(getEnv('FEE_BPS', '500')!, 10);
export const MIN_SWEEP_LAMPORTS = parseInt(getEnv('MIN_SWEEP_LAMPORTS', '1000000')!, 10);

// API Secrets
export const CRON_SECRET = requireEnv('CRON_SECRET');
export const SWEEPER_SECRET = getEnv('SWEEPER_SECRET');
export const VOLUME_PROCESSOR_SECRET = getEnv('VOLUME_PROCESSOR_SECRET');

// Legacy exports for backward compatibility
export const botToken = BOT_TOKEN;
export const supabaseUrl = SUPABASE_URL;
export const supabaseKey = SUPABASE_ANON_KEY;
export const supabaseServiceKey = SUPABASE_SERVICE_ROLE_KEY;
export const solanaRpcUrl = SOLANA_RPC_URL;
export const walletMasterSeed = WALLET_MASTER_SEED;
export const treasuryFeesAddress = TREASURY_FEES_ADDRESS;
export const treasuryOpsAddress = TREASURY_OPERATIONS_ADDRESS;
export const feeBps = FEE_BPS;
export const minSweepLamports = MIN_SWEEP_LAMPORTS;
export const cronSecret = CRON_SECRET;
export const sweeperSecret = SWEEPER_SECRET;
export const volumeProcessorSecret = VOLUME_PROCESSOR_SECRET;

// Volume Bot Configuration
export const volumeBotSettings = {
  volumePackages: [75000, 150000, 300000, 500000, 1000000, 2000000, 5000000, 10000000],
  durations: [6, 12, 24, 72, 168],
  baseCostPerTask: 1.5,
  swapFee: 0.0025,
  cyclesPerTask: 5,
};

// Environment validation
export function validateEnvironment() {
  console.log('🔍 Validating environment variables...');
  
  try {
    requireEnv('BOT_TOKEN');
    requireEnv('SUPABASE_URL');
    requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    requireEnv('WALLET_MASTER_SEED');
    requireEnv('TREASURY_FEES_ADDRESS');
    requireEnv('TREASURY_OPERATIONS_ADDRESS');
    requireEnv('CRON_SECRET');
    
    console.log('✅ All required environment variables present');
    console.log(`🔗 Solana RPC: ${SOLANA_RPC_URL}`);
    console.log(`💰 Fee rate: ${FEE_BPS / 100}%`);
    console.log(`🏦 Fees treasury: ${TREASURY_FEES_ADDRESS.substring(0, 8)}...`);
    console.log(`🏦 Ops treasury: ${TREASURY_OPERATIONS_ADDRESS.substring(0, 8)}...`);
    
    return true;
  } catch (error) {
    console.error('❌ Environment validation failed:', error);
    throw error;
  }
}