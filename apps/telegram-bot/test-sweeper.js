// Test sweeper locally
require('ts-node/register');
require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });

const { container } = require('./src/ioc-container');
const { TYPES } = require('./src/types');

async function testSweeper() {
  try {
    console.log('🔄 Testing sweeper...');
    
    // Get sweeper service instance
    const sweeper = container.get(TYPES.SweeperService);
    
    // Sweep all pending payments
    const results = await sweeper.sweepAllPendingPayments();
    
    console.log(`✅ Sweeper completed: ${results.swept}/${results.processed} orders swept`);
    console.log(`❌ Errors: ${results.errors.length}`);
    
    if (results.errors.length > 0) {
      console.log('Error details:');
      results.errors.forEach(err => console.log(`  - ${err}`));
    }
    
    console.log('🎉 Sweeper test completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Sweeper test failed:', error);
    process.exit(1);
  }
}

testSweeper();
