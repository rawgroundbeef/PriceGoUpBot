const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: '../../../.env' });
dotenv.config({ path: '../../../.env.local', override: true });
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

console.log('🔍 Current Environment Variables:');
console.log('');
console.log('💸 TREASURY_FEES_ADDRESS =', process.env.TREASURY_FEES_ADDRESS);
console.log('🏦 TREASURY_OPERATIONS_ADDRESS =', process.env.TREASURY_OPERATIONS_ADDRESS);
console.log('');
console.log('📝 Recommended configuration:');
console.log('TREASURY_FEES_ADDRESS=' + process.env.TREASURY_FEES_ADDRESS + '  # Your hardware wallet (revenue)');
console.log('TREASURY_OPERATIONS_ADDRESS=9z7PZNKFQ8PFfxwyin2842wKRZqZhf6jSmtfQpPoEzzD  # Derived hot wallet (operations)');
console.log('');
console.log('💰 Action needed: Move SOL from your current ops wallet to:');
console.log('9z7PZNKFQ8PFfxwyin2842wKRZqZhf6jSmtfQpPoEzzD');
