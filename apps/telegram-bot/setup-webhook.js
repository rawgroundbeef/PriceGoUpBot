// Setup Telegram webhook for production
const fetch = require('node-fetch');

async function setupWebhook() {
  const botToken = '8043293232:AAFS05zZvi-IGsqSqD99ollFQqnEulo6rDk';
  const webhookUrl = 'https://price-go-up-telegram-bot.vercel.app/api/webhook';
  
  try {
    console.log('🔄 Setting up Telegram webhook...');
    console.log(`Bot Token: ${botToken.substring(0, 10)}...`);
    console.log(`Webhook URL: ${webhookUrl}`);
    
    // Set the webhook
    const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query']
      })
    });
    
    const result = await response.json();
    
    if (result.ok) {
      console.log('✅ Webhook set successfully!');
      console.log('Response:', result);
    } else {
      console.error('❌ Failed to set webhook:', result);
    }
    
    // Verify webhook info
    console.log('\n🔍 Verifying webhook...');
    const infoResponse = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    const infoResult = await infoResponse.json();
    
    if (infoResult.ok) {
      console.log('📋 Webhook Info:');
      console.log(`   URL: ${infoResult.result.url}`);
      console.log(`   Has custom certificate: ${infoResult.result.has_custom_certificate}`);
      console.log(`   Pending updates: ${infoResult.result.pending_update_count}`);
      console.log(`   Last error: ${infoResult.result.last_error_message || 'None'}`);
      console.log(`   Max connections: ${infoResult.result.max_connections}`);
    }
    
  } catch (error) {
    console.error('❌ Error setting up webhook:', error);
  }
}

setupWebhook();

