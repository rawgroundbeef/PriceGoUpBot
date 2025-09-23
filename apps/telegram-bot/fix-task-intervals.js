// Fix existing task intervals
require('ts-node/register');
require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });

const { container } = require('./src/ioc-container');
const { TYPES } = require('./src/types');

async function fixTaskIntervals() {
  try {
    console.log('🔧 Fixing task intervals...');
    
    const supabaseService = container.get(TYPES.SupabaseService);
    
    // Get all running orders
    const runningOrders = await supabaseService.getOrdersByStatus('running');
    console.log(`📊 Found ${runningOrders.length} running orders`);
    
    for (const order of runningOrders) {
      console.log(`\n🔧 Fixing order ${order.id.substring(0, 8)}:`);
      
      // Calculate correct interval
      const totalCycles = order.tasks_count * 5; // 5 cycles per task
      const correctInterval = Math.max(5, Math.floor((order.duration_hours * 60) / totalCycles)); // At least 5 minutes
      
      console.log(`   Duration: ${order.duration_hours}h, Tasks: ${order.tasks_count}, Cycles: ${totalCycles}`);
      console.log(`   Correct interval: ${correctInterval} minutes`);
      
      // Get tasks for this order
      const tasks = await supabaseService.getOrderTasks(order.id);
      
      for (const task of tasks) {
        console.log(`   📋 Updating task ${task.id.substring(0, 8)}: ${task.interval_minutes} → ${correctInterval} min`);
        
        await supabaseService.updateVolumeTask(task.id, {
          interval_minutes: correctInterval
        });
      }
    }
    
    console.log('✅ Task intervals fixed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fix failed:', error);
    process.exit(1);
  }
}

fixTaskIntervals();
