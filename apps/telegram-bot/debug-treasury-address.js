const dotenv = require('dotenv');
const { hkdf } = require('@panva/hkdf');
const { Keypair } = require('@solana/web3.js');

// Load environment variables
dotenv.config({ path: '../../../.env' });
dotenv.config({ path: '../../../.env.local', override: true });
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

async function getTreasuryOperationsAddress() {
  const walletMasterSeed = process.env.WALLET_MASTER_SEED;
  
  if (!walletMasterSeed) {
    console.error('❌ WALLET_MASTER_SEED not found');
    return;
  }

  console.log('🔍 Deriving treasury operations address...');
  
  // Same logic as VolumeOrderService.derivePaymentKeypair
  const masterSeedBytes = Buffer.from(walletMasterSeed, 'hex');
  
  const derivedKey = await hkdf(
    'sha256',
    masterSeedBytes,
    new Uint8Array(0),
    Buffer.from('treasury-operations', 'utf8'),
    32
  );

  const keypair = Keypair.fromSeed(new Uint8Array(derivedKey));
  
  console.log('🏦 Treasury Operations Address:', keypair.publicKey.toString());
  console.log('💰 This address needs to be funded with SOL for trading operations');
  console.log('');
  console.log('🔗 Check balance: https://solscan.io/account/' + keypair.publicKey.toString());
}

getTreasuryOperationsAddress().catch(console.error);
