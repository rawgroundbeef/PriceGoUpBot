// Debug HKDF key derivation
require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });

const { hkdf } = require('@panva/hkdf');

async function debugHKDF() {
  try {
    console.log('🔍 Debugging HKDF...');
    
    const walletMasterSeed = process.env.WALLET_MASTER_SEED;
    console.log('Master seed present:', !!walletMasterSeed);
    console.log('Master seed length:', walletMasterSeed?.length);
    
    if (!walletMasterSeed) {
      console.error('❌ WALLET_MASTER_SEED not found');
      return;
    }
    
    // Test order ID
    const orderId = '886451f0-19d9-481b-9b6e-2a6e67528fe2';
    
    // Convert master seed from hex to bytes
    const masterSeedBytes = Buffer.from(walletMasterSeed, 'hex');
    console.log('Master seed bytes length:', masterSeedBytes.length);
    
    // Derive child seed using HKDF
    const childSeed = await hkdf('sha256', masterSeedBytes, Buffer.from(orderId), 'pricegoupbot:payment', 32);
    console.log('Child seed type:', typeof childSeed);
    console.log('Child seed length:', childSeed.length);
    console.log('Child seed (first 8 bytes):', Array.from(childSeed.slice(0, 8)));
    
    // Test Solana keypair generation
    const { Keypair } = require('@solana/web3.js');
    const seedArray = new Uint8Array(childSeed);
    console.log('Seed array length:', seedArray.length);
    
    const keypair = Keypair.fromSeed(seedArray);
    console.log('Generated address:', keypair.publicKey.toString());
    
  } catch (error) {
    console.error('❌ HKDF debug failed:', error);
  }
}

debugHKDF();
