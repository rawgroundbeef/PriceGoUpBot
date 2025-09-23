// Debug script to see task states
require('ts-node/register');
require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });

const { container } = require('./src/ioc-container');
const { TYPES } = require('./src/types');

async function debugTasks() {
  try {
    console.log('🔍 Debugging task states...');
    
    const supabaseService = container.get(TYPES.SupabaseService);
    
    // Get all running orders
    const runningOrders = await supabaseService.getOrdersByStatus('running');
    console.log(`📊 Found ${runningOrders.length} running orders`);
    
    for (const order of runningOrders) {
      console.log(`\n🚀 Order ${order.id.substring(0, 8)}:`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Started: ${order.started_at}`);
      
      // Get tasks for this order
      const tasks = await supabaseService.getOrderTasks(order.id);
      console.log(`   Tasks: ${tasks.length}`);
      
      for (const task of tasks) {
        console.log(`   📋 Task ${task.id.substring(0, 8)}:`);
        console.log(`      Status: ${task.status}`);
        console.log(`      Cycles: ${task.cycles_completed}/${task.total_cycles}`);
        console.log(`      Interval: ${task.interval_minutes} min`);
        console.log(`      Last run: ${task.last_transaction_at || 'never'}`);
        
        // Check if task should execute
        if (task.last_transaction_at) {
          const lastRun = new Date(task.last_transaction_at);
          const now = new Date();
          const minutesSince = (now.getTime() - lastRun.getTime()) / (1000 * 60);
          console.log(`      Minutes since last: ${minutesSince.toFixed(1)}`);
          console.log(`      Should execute: ${minutesSince >= task.interval_minutes ? 'YES' : 'NO'}`);
        } else {
          console.log(`      Should execute: YES (never run)`);
        }
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Debug failed:', error);
    process.exit(1);
  }
}

debugTasks();
