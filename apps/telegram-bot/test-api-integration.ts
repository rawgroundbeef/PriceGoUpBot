#!/usr/bin/env ts-node

/**
 * Simple test script to verify the Memeputer API integration
 * Run with: npx ts-node test-api-integration.ts
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

const API_BASE_URL = process.env.MEMEPUTER_API_URL || 'http://localhost:3001/api/v1';

async function testRandomImagesAPI() {
  console.log('🧪 Testing Memeputer API integration...');
  console.log(`📡 API URL: ${API_BASE_URL}`);
  
  try {
    const response = await fetch(`${API_BASE_URL}/images/random?count=1`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.MEMEPUTER_API_KEY && {
          'x-api-key': process.env.MEMEPUTER_API_KEY
        })
      }
    });

    console.log(`📊 Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API request failed: ${response.status} ${response.statusText}`);
      console.error(`📝 Error details: ${errorText}`);
      return;
    }

    const data = await response.json() as any;
    console.log('✅ API response received successfully!');
    console.log(`📈 Total images: ${data.total || 0}`);
    console.log(`🖼️ Images returned: ${data.images?.length || 0}`);
    
    if (data.images && data.images.length > 0) {
      const image = data.images[0];
      console.log('\n📋 Sample image data:');
      console.log(`   ID: ${image.id}`);
      console.log(`   Participant: ${image.participant}`);
      console.log(`   Prompt: ${image.prompt?.substring(0, 100)}...`);
      console.log(`   Image URL: ${image.image_url}`);
      console.log(`   Created: ${image.created_at}`);
    }
    
    console.log('\n🎉 API integration test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testRandomImagesAPI();
