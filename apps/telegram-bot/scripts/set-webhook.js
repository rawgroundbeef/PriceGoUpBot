#!/usr/bin/env node

/**
 * Script to automatically set Telegram webhook after Vercel deployment
 * This runs as part of the Vercel build process
 */

const https = require('https');

async function setWebhook() {
  const botToken = process.env.BOT_TOKEN;
  const vercelUrl = process.env.VERCEL_URL;
  
  if (!botToken) {
    console.error('❌ BOT_TOKEN environment variable is required');
    process.exit(1);
  }
  
  if (!vercelUrl) {
    console.error('❌ VERCEL_URL environment variable is required');
    process.exit(1);
  }
  
  const webhookUrl = `https://${vercelUrl}/api/webhook`;
  console.log(`🔗 Setting webhook URL: ${webhookUrl}`);
  
  const postData = JSON.stringify({
    url: webhookUrl
  });
  
  const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: `/bot${botToken}/setWebhook`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.ok) {
            console.log('✅ Webhook set successfully!');
            console.log(`📡 Webhook URL: ${webhookUrl}`);
            resolve(response);
          } else {
            console.error('❌ Failed to set webhook:', response);
            reject(new Error(response.description || 'Unknown error'));
          }
        } catch (error) {
          console.error('❌ Error parsing response:', error);
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ Request error:', error);
      reject(error);
    });
    
    req.write(postData);
    req.end();
  });
}

// Only run if this is a Vercel deployment
if (process.env.VERCEL === '1') {
  setWebhook()
    .then(() => {
      console.log('🚀 Webhook configuration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Webhook configuration failed:', error);
      process.exit(1);
    });
} else {
  console.log('⏭️  Skipping webhook setup (not a Vercel deployment)');
}
