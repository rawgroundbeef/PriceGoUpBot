import { NextResponse } from "next/server";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { hkdf } from "@panva/hkdf";
import bs58 from "bs58";

async function deriveTreasuryOpsKeypair(masterSeedHex: string) {
  const masterSeedBytes = Buffer.from(masterSeedHex, "hex");
  const derived = await hkdf(
    "sha256",
    masterSeedBytes,
    Buffer.alloc(0),
    Buffer.from("treasury-operations"),
    32,
  );
  return Keypair.fromSeed(new Uint8Array(derived));
}

async function derivePerOrderBudgetAddress(masterSeedHex: string, orderId: string) {
  const masterSeedBytes = Buffer.from(masterSeedHex, "hex");
  const derived = await hkdf(
    "sha256",
    masterSeedBytes,
    Buffer.from(orderId),
    Buffer.from("pricegoupbot:ops-budget"),
    32,
  );
  const kp = Keypair.fromSeed(new Uint8Array(derived));
  return kp.publicKey;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: orderId } = await ctx.params;
    const rpc = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    const seedHex = process.env.WALLET_MASTER_SEED as string | undefined;
    const opsSecret = process.env.TREASURY_OPERATIONS_SECRET_KEY as string | undefined;
    if (!seedHex && !opsSecret) {
      return NextResponse.json({ error: "No signer configured. Set WALLET_MASTER_SEED or TREASURY_OPERATIONS_SECRET_KEY in apps/admin env." }, { status: 500 });
    }

    let amountSol: number | null = null;
    // Support form submissions and JSON
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      amountSol = typeof body.amount === "string" ? parseFloat(body.amount) : body.amount;
    } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const val = form.get("amount");
      amountSol = typeof val === "string" ? parseFloat(val) : (typeof val === "number" ? val : null);
    }
    if (!amountSol || !isFinite(amountSol) || amountSol <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const conn = new Connection(rpc, "confirmed");
    let ops: Keypair;
    let budgetPubkey: PublicKey;
    if (opsSecret) {
      try {
        if (opsSecret.trim().startsWith("[")) {
          const arr = JSON.parse(opsSecret) as number[];
          ops = Keypair.fromSecretKey(new Uint8Array(arr));
        } else {
          try {
            const bytes = bs58.decode(opsSecret.trim());
            ops = Keypair.fromSecretKey(bytes);
          } catch {
            const hex = opsSecret.trim().startsWith("0x") ? opsSecret.trim().slice(2) : opsSecret.trim();
            ops = Keypair.fromSecretKey(Buffer.from(hex, "hex"));
          }
        }
      } catch (e) {
        return NextResponse.json({ error: `Failed to parse TREASURY_OPERATIONS_SECRET_KEY: ${e instanceof Error ? e.message : String(e)}` }, { status: 400 });
      }
      // Derive per-order budget from master seed if available; otherwise compute the same way requiring seed
      if (!seedHex) {
        return NextResponse.json({ error: "WALLET_MASTER_SEED required to derive per-order budget address" }, { status: 500 });
      }
      budgetPubkey = await derivePerOrderBudgetAddress(seedHex, orderId);
    } else {
      // No ops secret provided, derive both from seed
      ops = await deriveTreasuryOpsKeypair(seedHex as string);
      budgetPubkey = await derivePerOrderBudgetAddress(seedHex as string, orderId);
    }

    const opsBalanceLamports = await conn.getBalance(ops.publicKey);
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
    if (opsBalanceLamports < lamports) {
      return NextResponse.json({ error: "Insufficient Treasury Ops balance" }, { status: 400 });
    }

    const transferIx = SystemProgram.transfer({ fromPubkey: ops.publicKey, toPubkey: budgetPubkey, lamports });
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
    const tx = new Transaction({ feePayer: ops.publicKey, recentBlockhash: blockhash }).add(transferIx);
    const sig = await conn.sendTransaction(tx, [ops]);
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

    return NextResponse.json({ ok: true, signature: sig, from: ops.publicKey.toBase58(), to: budgetPubkey.toBase58(), lamports });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}


