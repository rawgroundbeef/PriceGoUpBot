# PriceGoUpBot - Solana Volume Generation Bot

A Telegram bot for Solana SPL token volume generation. Users can select volume targets and durations, and the bot automatically generates trading volume through multiple unlinked wallets to create bullish chart patterns and boost token rankings.

## Features

- 🚀 Volume generation for Solana SPL tokens
- 📊 Multiple volume packages ($75K - $10M)
- ⏱️ Flexible durations (6 hours to 7 days)
- 💰 SOL payment processing with QR codes
- 🔄 Automated buy/sell cycles through thousands of wallets
- 📈 Organic-looking trading patterns
- 🔥 Free Dexscreener trending boost
- 💳 0% hidden fees - transparent pricing

## Quick Start

1. **Install dependencies:**
   ```bash
   yarn install
   ```

2. **Environment setup** - Create a `.env` file:
   ```bash
   # Telegram Bot Configuration
   BOT_TOKEN=your_telegram_bot_token_here
   
   # Supabase Configuration
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   
   # Solana Configuration
   SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
   PAYMENT_WALLET_ADDRESS=your_solana_wallet_address_here
   ```

3. **Database setup** - Run the SQL from `database-schema.sql` in Supabase

4. **Get required accounts:**
   - Telegram bot token from [@BotFather](https://t.me/botfather)
   - [Supabase](https://supabase.com) project
   - Solana wallet for payments

## Development

Start the bot in development mode:
```bash
yarn dev
```

## Deployment

Deploy to Vercel:
```bash
vercel --prod
```

For detailed setup instructions, see [SETUP.md](./SETUP.md).

## Bot Commands

- `/start` - Start the bot and create volume orders
- `/orders` - View your active orders  
- `/help` - Get help with the bot

## User Flow

1. **Volume Selection** - Choose target volume ($75K - $10M)
2. **Duration Selection** - Choose time frame (6h - 7 days)
3. **Token Address** - Provide SPL token contract address
4. **Pool Selection** - Choose liquidity pool to use
5. **Order Review** - Confirm order details
6. **Payment** - Pay in SOL via QR code or address
7. **Execution** - Volume generation starts automatically

## Volume Packages

| Volume | Duration Options | Tasks | Popular |
|--------|------------------|-------|---------|
| $75K   | 6h - 7 days     | 1-12  |         |
| $150K  | 6h - 7 days     | 2-18  |         |
| $300K  | 6h - 7 days     | 4-36  |         |
| $500K  | 6h - 7 days     | 6-60  |         |
| $1M    | 6h - 7 days     | 12-120| ⭐ Popular |
| $2M    | 6h - 7 days     | 24-240|         |
| $5M    | 6h - 7 days     | 60-600| 🔥 Trending |
| $10M   | 6h - 7 days     | 120-1200| 🔥 Trending |

## How Volume Generation Works

1. **Task Creation** - Each order creates multiple parallel tasks
2. **Wallet Distribution** - Each task uses a unique, unlinked wallet
3. **Trading Cycles** - Each task runs 3 buys + 2 sells in random sizes
4. **Timing Variation** - Randomized intervals create organic patterns
5. **Continuous Execution** - Tasks run until volume target is reached

## Architecture

- **Frontend**: Telegram Bot Interface
- **Backend**: Node.js/TypeScript with Inversify IoC
- **Database**: Supabase (PostgreSQL)
- **Blockchain**: Solana
- **Deployment**: Vercel with Edge Functions

## License

MIT 