// Check treasury balances
require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });

const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

async function checkTreasuries() {
  try {
    console.log('💰 Checking treasury balances...');
    
    const connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');
    
    const feesAddress = process.env.TREASURY_FEES_ADDRESS;
    const opsAddress = process.env.TREASURY_OPERATIONS_ADDRESS;
    
    if (!feesAddress || !opsAddress) {
      console.error('❌ Treasury addresses not configured');
      return;
    }
    
    console.log(`\n🏦 Treasury Addresses:`);
    console.log(`   Fees: ${feesAddress}`);
    console.log(`   Ops:  ${opsAddress}`);
    
    const feesBalance = await connection.getBalance(new PublicKey(feesAddress));
    const opsBalance = await connection.getBalance(new PublicKey(opsAddress));
    
    console.log(`\n💰 Treasury Balances:`);
    console.log(`   Fees Treasury: ${feesBalance / LAMPORTS_PER_SOL} SOL`);
    console.log(`   Ops Treasury:  ${opsBalance / LAMPORTS_PER_SOL} SOL`);
    
    // Also check the payment address
    const paymentAddress = '4LFQiTYDoAwRJjABXArGAGPjNSZiumoFWT5uUssK9MFY';
    const paymentBalance = await connection.getBalance(new PublicKey(paymentAddress));
    console.log(`   Payment Address: ${paymentBalance / LAMPORTS_PER_SOL} SOL`);
    
  } catch (error) {
    console.error('❌ Check failed:', error);
  }
}

checkTreasuries();
