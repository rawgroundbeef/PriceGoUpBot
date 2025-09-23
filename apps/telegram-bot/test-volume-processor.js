// Quick test script to trigger volume processor locally
require('ts-node/register');
require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });

const { container } = require('./src/ioc-container');
const { TYPES } = require('./src/types');

async function testVolumeProcessor() {
  try {
    console.log('🔄 Testing volume processor...');
    
    // Get service instances
    const volumeEngine = container.get(TYPES.VolumeEngineService);
    const volumeOrderService = container.get(TYPES.VolumeOrderService);

    // Find orders that need to be started
    const pendingOrders = await volumeOrderService.getPendingOrders();
    console.log(`📊 Found ${pendingOrders.length} orders ready to start`);

    for (const order of pendingOrders) {
      try {
        console.log(`🚀 Starting volume generation for order ${order.id}`);
        await volumeEngine.startVolumeGeneration(order.id);
        console.log(`✅ Started order ${order.id}`);
      } catch (error) {
        console.error(`❌ Error starting order ${order.id}:`, error);
      }
    }

    // Process all pending tasks
    console.log('📊 Processing pending tasks...');
    const taskResults = await volumeEngine.processAllPendingTasks();
    console.log(`✅ Processed ${taskResults.processedTasks} tasks`);
    
    console.log('🎉 Volume processor test completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Volume processor test failed:', error);
    process.exit(1);
  }
}

testVolumeProcessor();
