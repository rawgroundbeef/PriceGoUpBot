# PriceGoUpBot Setup Guide

## Overview

PriceGoUpBot is a Telegram bot for Solana SPL token volume generation. It allows users to select volume targets, durations, and automatically generates trading volume through multiple unlinked wallets.

## Architecture

- **Frontend**: Telegram Bot Interface
- **Backend**: Node.js/TypeScript with Inversify IoC
- **Database**: Supabase (PostgreSQL)
- **Blockchain**: Solana
- **Deployment**: Vercel

## Prerequisites

1. Node.js 20+ and Yarn
2. Telegram Bot Token (from @BotFather)
3. Supabase Project
4. Solana Wallet for Payments
5. Vercel Account (for deployment)

## Environment Setup

Create a `.env` file with the following variables:

```env
# Telegram Bot Configuration
BOT_TOKEN=your_telegram_bot_token_here

# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Solana Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
PAYMENT_WALLET_ADDRESS=your_solana_wallet_address_here

# Vercel Configuration (for deployment)
VERCEL=1
```

## Database Setup

1. Create a new Supabase project
2. Run the SQL commands from `database-schema.sql` in your Supabase SQL editor
3. This will create all necessary tables, indexes, and RLS policies

### Database Tables Created:
- `volume_orders` - Main order records
- `volume_tasks` - Individual volume generation tasks
- `token_info` - SPL token metadata cache
- `liquidity_pools` - Liquidity pool information
- `transactions` - Buy/sell transaction records

## Installation

1. Install dependencies:
```bash
yarn install
```

2. Build the project:
```bash
yarn build
```

3. Set up your Telegram webhook (for production):
```bash
yarn vercel-build
```

## Development

Run in development mode:
```bash
yarn dev
```

## Deployment

### Vercel Deployment

1. Connect your repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Manual Deployment

```bash
yarn vercel-build
vercel --prod
```

## Bot Features

### Volume Packages
- $75K, $150K, $300K, $500K
- $1M (Popular), $2M
- $5M (Trending), $10M (Trending)

### Duration Options
- 6 hours, 12 hours, 24 hours
- 3 days, 7 days

### Trading Strategy
- Each task runs 3 buys + 2 sells in cycles
- Random transaction sizes
- Thousands of unlinked wallets
- Organic-looking volume patterns

## Bot Commands

- `/start` - Start the bot and create volume orders
- `/orders` - View your active orders
- `/help` - Get help with the bot

## User Flow

1. **Volume Selection**: Choose target volume ($75K - $10M)
2. **Duration Selection**: Choose time frame (6h - 7 days)
3. **Token Address**: Provide SPL token contract address
4. **Pool Selection**: Choose liquidity pool to use
5. **Order Review**: Confirm order details
6. **Payment**: Pay in SOL via QR code or address
7. **Execution**: Volume generation starts automatically

## Technical Details

### Services Architecture

- **PriceGoUpBotService**: Main Telegram bot handlers
- **VolumeOrderService**: Order management and persistence
- **SolanaService**: Solana blockchain integration
- **PaymentService**: Payment processing and QR codes
- **VolumeEngineService**: Volume generation execution
- **SupabaseService**: Database operations

### Volume Generation

The volume engine creates multiple tasks per order, each with:
- Unique wallet address
- Target volume allocation
- Execution intervals
- Buy/sell cycle tracking

Tasks execute in parallel with randomized timing to create organic-looking trading patterns.

### Security Features

- Row Level Security (RLS) on all database tables
- User isolation (users can only see their own orders)
- Service role for bot operations
- Payment verification before execution

## Monitoring

### Order Status Tracking
- `pending_payment` - Waiting for payment
- `payment_confirmed` - Payment received
- `running` - Volume generation active
- `completed` - Order finished
- `cancelled` - Order cancelled
- `failed` - Order failed

### Task Status Tracking
- `pending` - Task not started
- `running` - Task executing
- `paused` - Task paused
- `completed` - Task finished
- `failed` - Task failed

## API Integrations

### Jupiter Token List
- Fetches comprehensive SPL token metadata
- Cached locally for performance

### Raydium Pools
- Fetches liquidity pool information
- Supports pool selection and validation

### Solana RPC
- Token validation
- Payment verification
- Transaction execution (simulated)

## Troubleshooting

### Common Issues

1. **Bot not responding**: Check BOT_TOKEN and webhook setup
2. **Database errors**: Verify Supabase connection and schema
3. **Payment verification failing**: Check PAYMENT_WALLET_ADDRESS
4. **Token not found**: Ensure token address is valid SPL token

### Logs

Check Vercel function logs or local console for detailed error information.

## Development Notes

### Adding New Features

1. Create service interfaces in `src/interfaces/`
2. Implement services in `src/services/`
3. Register services in `src/ioc-container.ts`
4. Update types in `src/types/index.ts`

### Database Changes

1. Update schema in `database-schema.sql`
2. Update interfaces in `src/interfaces/volume-bot.interface.ts`
3. Update service methods as needed

### Testing

The current implementation includes simulation mode for volume generation. In production, you would implement actual Solana transactions.

## Support

For technical support or questions about the bot implementation, refer to the code documentation and service interfaces.
