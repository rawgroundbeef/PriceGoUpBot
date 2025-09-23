const dotenv = require('dotenv');
const fetch = require('node-fetch');

// Load environment variables
dotenv.config({ path: '../../../.env' });
dotenv.config({ path: '../../../.env.local', override: true });
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN not found in environment variables');
  process.exit(1);
}

async function clearWebhook() {
  try {
    console.log('🔄 Clearing webhook for local development...');
    
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`, {
      method: 'POST',
    });
    
    const result = await response.json();
    
    if (result.ok) {
      console.log('✅ Webhook cleared successfully!');
      console.log('🔄 You can now run the bot in local polling mode');
    } else {
      console.error('❌ Failed to clear webhook:', result);
    }
  } catch (error) {
    console.error('❌ Error clearing webhook:', error);
  }
}

clearWebhook();
