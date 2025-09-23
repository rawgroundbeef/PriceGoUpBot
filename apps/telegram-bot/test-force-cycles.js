// Force execute task cycles for testing (ignores timing)
require('ts-node/register');
require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });

const { container } = require('./src/ioc-container');
const { TYPES } = require('./src/types');

async function forceCycles() {
  try {
    console.log('🔄 Force executing task cycles...');
    
    const supabaseService = container.get(TYPES.SupabaseService);
    
    // Get all running orders
    const runningOrders = await supabaseService.getOrdersByStatus('running');
    console.log(`📊 Found ${runningOrders.length} running orders`);
    
    for (const order of runningOrders) {
      console.log(`\n🚀 Processing order ${order.id.substring(0, 8)}:`);
      
      const tasks = await supabaseService.getOrderTasks(order.id);
      console.log(`   Found ${tasks.length} tasks`);
      
      for (const task of tasks) {
        if (task.status === 'completed') {
          console.log(`   ✅ Task ${task.id.substring(0, 8)} already completed`);
          continue;
        }
        
        console.log(`   🔄 Force executing task ${task.id.substring(0, 8)} (cycle ${task.cycles_completed + 1}/${task.total_cycles})`);
        
        // Simulate a buy/sell cycle
        const newCycles = task.cycles_completed + 1;
        const progressPercent = newCycles / task.total_cycles;
        const newVolume = task.target_volume * progressPercent;
        
        // Create mock transactions
        await supabaseService.createTransaction({
          task_id: task.id,
          signature: `mock_buy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type: 'buy',
          amount_sol: 0.1,
          amount_tokens: 100,
          price: 0.001
        });
        
        await supabaseService.createTransaction({
          task_id: task.id,
          signature: `mock_sell_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type: 'sell',
          amount_sol: 0.08,
          amount_tokens: 80,
          price: 0.001
        });
        
        // Update task progress
        await supabaseService.updateVolumeTask(task.id, {
          cycles_completed: newCycles,
          current_volume: newVolume,
          last_transaction_at: new Date().toISOString(),
          status: newCycles >= task.total_cycles ? 'completed' : 'running'
        });
        
        console.log(`   ✅ Completed cycle ${newCycles}/${task.total_cycles}, volume: $${newVolume.toFixed(2)}`);
        
        if (newCycles >= task.total_cycles) {
          console.log(`   🎉 Task completed!`);
        }
      }
      
      // Check if all tasks completed
      const updatedTasks = await supabaseService.getOrderTasks(order.id);
      const completedTasks = updatedTasks.filter(t => t.status === 'completed');
      
      if (completedTasks.length === updatedTasks.length) {
        await supabaseService.updateVolumeOrder(order.id, {
          status: 'completed',
          completed_at: new Date().toISOString()
        });
        console.log(`   🎉 Order ${order.id.substring(0, 8)} completed!`);
      }
    }
    
    console.log('✅ Force cycles completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Force cycles failed:', error);
    process.exit(1);
  }
}

forceCycles();
