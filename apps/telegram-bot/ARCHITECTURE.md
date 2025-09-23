# PriceGoUpBot – Keys, Payments, Sweeping, and Fees

This document describes how we handle payment addresses, private keys, sweeping funds, and fee accounting in a serverless-safe, stateless way.

## Goals

- No private keys stored at rest in the database
- Deterministic, per-order payment address generation
- Safe sweeping of funds to a treasury wallet
- Clear fee accounting and separation of funds
- Works in serverless (stateless) environments

## High-Level Flow

1. User selects volume + duration → draft order is created
2. We generate a deterministic payment address for that order
3. User pays the exact SOL amount to that address
4. Cron/processor detects payment → marks order as `payment_confirmed`
5. Sweeper derives the private key for the order’s payment address and sweeps funds
6. Funds are split between Fee Treasury and Operations Treasury
7. Volume engine disburses operational funds to task wallets and executes volume

## Deterministic Keys (No Secret Storage)

We derive keys on-demand using a single 32-byte master secret (not the Supabase service key) and HKDF-SHA256. Keys are never stored at rest; only the public address is persisted.

### Environment Variables

```
# 32-byte seed as base58 or hex (we recommend 32 raw bytes encoded as base58)
WALLET_MASTER_SEED=...

# Treasury wallets (public)
TREASURY_FEES_ADDRESS=...          # Where service fees go
TREASURY_OPERATIONS_ADDRESS=...    # Where operational funds land

# Fee configuration
FEE_BPS=500              # 500 bps = 5.00% service fee (example)
MIN_SWEEP_LAMPORTS=1000000  # 0.001 SOL; skip sweeping dust
```

### Derivation

We use HKDF to derive a 32-byte child seed from `WALLET_MASTER_SEED` using context information.

```
childSeed = HKDF_SHA256(
  inputKeyMaterial = WALLET_MASTER_SEED,
  salt             = orderId,                 # or `${orderId}:${namespace}`
  info             = "pricegoupbot:payment"   # different info for other children
)

paymentKeypair = Keypair.fromSeed(childSeed)
paymentAddress = paymentKeypair.publicKey
```

- Private key is reconstructed on-demand inside a serverless function and never stored.
- For other child keys (task wallets), vary `info` and/or append `taskIndex`.

### Where is the private key stored?

- Nowhere at rest. It is derived in memory (using the method above), used for sweeping/spending, then discarded.
- Only the public `payment_address` is stored in `volume_orders`.

> Note: We recommend adjusting the order creation flow so the payment address is derived from the final `order.id` (UUID) for uniqueness. Create the order first to obtain `order.id`, then compute the payment address, then update the order with the derived address.

## Payment Address Lifecycle

- On order creation, derive `payment_address` from `order.id` and persist the address only.
- Users pay the full amount to the `payment_address`.
- The processor verifies payment via Solana RPC (either by balance check or by scanning recent signatures).

### Verification Options

- Balance check of `payment_address` against expected amount
- Or, sum of confirmed inbound transfers (pre/post lamports delta)

## Sweeping Funds

After `payment_confirmed`, sweeping is performed by a background job (Vercel cron or Supabase scheduled job):

1. Re-derive the order’s `paymentKeypair` with HKDF.
2. Get balance of `payment_address`.
3. If balance < `MIN_SWEEP_LAMPORTS`, skip.
4. Compute fee split:
   - `serviceFee = totalPaid * FEE_BPS / 10000`
   - `opsFunds   = totalPaid - serviceFee`
5. Send `serviceFee` to `TREASURY_FEES_ADDRESS`.
6. Send `opsFunds` to `TREASURY_OPERATIONS_ADDRESS` (or keep a small gas buffer if desired).
7. Mark sweep completion in DB with signatures for both transfers.

> Optional: Combine fee + ops into a single sweep to operations, then account fees at the ledger level. The approach above gives cleaner on-chain separation.

## Task Wallets and Disbursements

Each volume task uses a separate wallet to create organic patterns:

```
childSeed = HKDF_SHA256(WALLET_MASTER_SEED, salt=`${orderId}:${taskIndex}`, info="pricegoupbot:task")
taskKeypair = Keypair.fromSeed(childSeed)
```

- Engine disburses small SOL amounts from `TREASURY_OPERATIONS_ADDRESS` to task wallets as needed.
- Task wallets execute swaps (3 buys + 2 sells per cycle) via Raydium/aggregator.
- Task wallets can be swept back to `TREASURY_OPERATIONS_ADDRESS` after execution.

## Fees

- Fees are included in the quoted price ("0% hidden fees"), but we keep explicit accounting.
- `FEE_BPS` defines the service fee portion captured on sweep.
- On sweep, fees are moved to `TREASURY_FEES_ADDRESS` immediately; operational funds are allocated to `TREASURY_OPERATIONS_ADDRESS`.
- A `fees_ledger` (optional table) can store `{ order_id, service_fee_sol, sweep_signature }` for audit.

## Database Notes (Optional Tables)

- `volume_orders(payment_address, payment_signature, sweep_fee_sig, sweep_ops_sig)` – record sweep tx signatures
- `fees_ledger(order_id, fee_sol, tx_sig, created_at)` – optional audit ledger
- `task_wallets(order_id, task_index, wallet_address)` – optional cache of derived wallets

## Security

- `WALLET_MASTER_SEED` is stored only in Vercel encrypted env vars (and/or Supabase Secrets) and accessed only by server-side functions.
- Keys are derived in-memory, never written to DB or logs.
- Separate treasuries for fees and operations for clean financial segregation.
- Use RPC providers that support rate-limits well for verification (extend backoff/retry logic).

## Failure / Retry Model

- Sweeper is idempotent: re-deriving keys is deterministic; if a tx signature is already recorded, skip.
- If sweep fails mid-way, retry only the missing leg (fee or ops) using stored intent in DB.
- If verification shows partial payment, keep order in `pending_payment` with balance shortfall logged.

## Example Pseudocode (Typescript)

```ts
import { Keypair } from '@solana/web3.js';
import { hkdfSync } from '@panva/hkdf';

function deriveKeypair(orderId: string, info: string): Keypair {
  const masterSeed = getEnvBytes('WALLET_MASTER_SEED'); // 32 bytes
  const child = hkdfSync('sha256', masterSeed, Buffer.from(orderId), info, 32);
  return Keypair.fromSeed(child);
}

// Payment address
await createOrderDraft();
const paymentKP = deriveKeypair(order.id, 'pricegoupbot:payment');
await updateOrder({ payment_address: paymentKP.publicKey.toString() });

// Sweep
const balance = await connection.getBalance(paymentKP.publicKey);
if (balance > MIN_SWEEP_LAMPORTS) {
  const serviceFee = (balance * FEE_BPS) / 10000;
  const opsFunds   = balance - serviceFee - rentAndFees;
  // build + send 1-2 transactions using paymentKP as signer
}
```

> We recommend using a well-vetted HKDF library (e.g., `@panva/hkdf`) and validating your seed handling (base58/hex) strictly.

## Production Considerations

- Replace the current address-generation call site to derive from `order.id` (not userId/time) for better uniqueness.
- Ensure sweeper and engine run in separate cron tasks.
- Add rate-limit and retry policies around RPC and Dexscreener calls.
- Record on-chain tx signatures for payment verification and sweeping.

## Quick Checklist

- [ ] Add `WALLET_MASTER_SEED`, `TREASURY_FEES_ADDRESS`, `TREASURY_OPERATIONS_ADDRESS`, `FEE_BPS`, `MIN_SWEEP_LAMPORTS` to env
- [ ] Change order creation to derive payment address from `order.id`
- [ ] Implement sweeper with HKDF-derived key and fee split
- [ ] Record sweep tx signatures in DB
- [ ] Derive per-task wallets using HKDF and disburse from operations treasury
