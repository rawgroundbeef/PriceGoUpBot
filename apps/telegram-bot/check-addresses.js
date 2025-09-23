// Check payment addresses for existing order
require('ts-node/register');
require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });

const { container } = require('./src/ioc-container');
const { TYPES } = require('./src/types');

async function checkAddresses() {
  try {
    console.log('🔍 Checking payment addresses...');
    
    const supabaseService = container.get(TYPES.SupabaseService);
    const volumeOrderService = container.get(TYPES.VolumeOrderService);
    
    // Get your newest order (by creation date)
    const allOrders = await supabaseService.getOrdersByStatus('payment_confirmed');
    const runningOrders = await supabaseService.getOrdersByStatus('running');
    const allOrdersSorted = [...allOrders, ...runningOrders].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    if (allOrdersSorted.length === 0) {
      console.log('❌ No orders found');
      return;
    }
    
    const order = allOrdersSorted[0]; // Most recent order
    console.log(`\n📋 Order ${order.id.substring(0, 8)}:`);
    console.log(`   Stored payment address: ${order.payment_address}`);
    
    // Generate what HKDF would produce for this order
    const hkdfAddress = await volumeOrderService.derivePaymentAddress(order.id);
    console.log(`   HKDF payment address:   ${hkdfAddress}`);
    
    console.log(`   Addresses match: ${order.payment_address === hkdfAddress ? 'YES' : 'NO'}`);
    
    // Check balances of both
    const { Connection } = require('@solana/web3.js');
    const { PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
    const connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');
    
    const storedBalance = await connection.getBalance(new PublicKey(order.payment_address));
    const hkdfBalance = await connection.getBalance(new PublicKey(hkdfAddress));
    
    console.log(`   Stored address balance: ${storedBalance / LAMPORTS_PER_SOL} SOL`);
    console.log(`   HKDF address balance:   ${hkdfBalance / LAMPORTS_PER_SOL} SOL`);
    
  } catch (error) {
    console.error('❌ Check failed:', error);
  }
}

checkAddresses();
