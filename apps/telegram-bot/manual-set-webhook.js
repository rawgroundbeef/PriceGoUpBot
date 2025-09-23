const fetch = require('node-fetch');

const BOT_TOKEN = '8043293232:AAFS05zZvi-IGsqSqD99ollFQqnEulo6rDk';
const WEBHOOK_URL = 'https://price-go-up-telegram-bot.vercel.app/api/webhook';

async function setWebhook() {
  try {
    console.log('🔄 Setting webhook...');
    console.log(`Bot Token: ${BOT_TOKEN.substring(0, 20)}...`);
    console.log(`Webhook URL: ${WEBHOOK_URL}`);
    
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: WEBHOOK_URL,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: true,
      }),
    });
    
    const result = await response.json();
    
    if (result.ok) {
      console.log('✅ Webhook set successfully!');
      console.log('🤖 Bot is now live at:', WEBHOOK_URL);
      console.log('📱 Try sending a message to your bot!');
    } else {
      console.error('❌ Failed to set webhook:', result);
    }
  } catch (error) {
    console.error('❌ Error setting webhook:', error);
  }
}

setWebhook();
