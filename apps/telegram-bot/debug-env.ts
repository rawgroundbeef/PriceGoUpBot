#!/usr/bin/env ts-node

import dotenv from 'dotenv';

dotenv.config();

console.log('🔍 Environment Variables Debug:');
console.log('MEMEPUTER_API_URL:', process.env.MEMEPUTER_API_URL);
console.log('MEMEPUTER_API_KEY:', process.env.MEMEPUTER_API_KEY ? 'SET (length: ' + process.env.MEMEPUTER_API_KEY.length + ')' : 'NOT SET');
console.log('BOT_TOKEN:', process.env.BOT_TOKEN ? 'SET (length: ' + process.env.BOT_TOKEN.length + ')' : 'NOT SET');
