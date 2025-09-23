const dotenv = require('dotenv');
const { hkdf } = require('@panva/hkdf');
const { Keypair } = require('@solana/web3.js');

// Load environment variables
dotenv.config({ path: '../../../.env' });
dotenv.config({ path: '../../../.env.local', override: true });
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

async function getTreasuryAddresses() {
  const walletMasterSeed = process.env.WALLET_MASTER_SEED;
  
  if (!walletMasterSeed) {
    console.error('❌ WALLET_MASTER_SEED not found');
    return;
  }

  console.log('🏦 Deriving treasury addresses from master seed...');
  console.log('');
  
  // Derive Treasury Operations (for funding trading wallets)
  const masterSeedBytes = Buffer.from(walletMasterSeed, 'hex');
  
  const opsKey = await hkdf(
    'sha256',
    masterSeedBytes,
    new Uint8Array(0),
    Buffer.from('treasury-operations', 'utf8'),
    32
  );
  const opsKeypair = Keypair.fromSeed(new Uint8Array(opsKey));
  
  // Derive Treasury Fees (for collecting service fees)
  const feesKey = await hkdf(
    'sha256',
    masterSeedBytes,
    new Uint8Array(0),
    Buffer.from('treasury-fees', 'utf8'),
    32
  );
  const feesKeypair = Keypair.fromSeed(new Uint8Array(feesKey));
  
  console.log('🏦 TREASURY_OPERATIONS_ADDRESS=' + opsKeypair.publicKey.toString());
  console.log('💰 This wallet funds all trading operations');
  console.log('🔗 Check: https://solscan.io/account/' + opsKeypair.publicKey.toString());
  console.log('');
  console.log('💸 TREASURY_FEES_ADDRESS=' + feesKeypair.publicKey.toString());
  console.log('💰 This wallet collects service fees from users');
  console.log('🔗 Check: https://solscan.io/account/' + feesKeypair.publicKey.toString());
  console.log('');
  console.log('📝 Update your .env file with these addresses:');
  console.log(`TREASURY_OPERATIONS_ADDRESS=${opsKeypair.publicKey.toString()}`);
  console.log(`TREASURY_FEES_ADDRESS=${feesKeypair.publicKey.toString()}`);
  console.log('');
  console.log('💰 Then fund the operations address with 5-10 SOL for trading');
}

getTreasuryAddresses().catch(console.error);
