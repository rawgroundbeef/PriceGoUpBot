import { createClient } from "@supabase/supabase-js";
import { Keypair, Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { hkdf } from "@panva/hkdf";
import Link from "next/link";

type Order = {
  id: string;
  user_id: string;
  token_address: string;
  pool_address: string;
  volume_target: number;
  duration_hours: number;
  tasks_count: number;
  total_cost: number;
  status: string;
  created_at: string;
};

type Transaction = {
  id: string;
  task_id: string;
  signature: string;
  type: "buy" | "sell";
  amount_sol: number;
  amount_tokens: number;
  price: number;
  created_at: string;
};

async function deriveOpsBudgetAddress(orderId: string) {
  const seedHex = process.env.WALLET_MASTER_SEED;
  if (!seedHex) return null;
  const masterSeedBytes = Buffer.from(seedHex, "hex");
  const derived = await hkdf(
    "sha256",
    masterSeedBytes,
    Buffer.from(orderId),
    Buffer.from("pricegoupbot:ops-budget"),
    32,
  );
  const kp = Keypair.fromSeed(new Uint8Array(derived));
  return kp.publicKey.toBase58();
}

async function deriveTreasuryOpsAddress() {
  const seedHex = process.env.WALLET_MASTER_SEED;
  if (!seedHex) return null;
  const masterSeedBytes = Buffer.from(seedHex, "hex");
  const derived = await hkdf(
    "sha256",
    masterSeedBytes,
    Buffer.alloc(0),
    Buffer.from("treasury-operations"),
    32,
  );
  const kp = Keypair.fromSeed(new Uint8Array(derived));
  return kp.publicKey.toBase58();
}

async function getSolBalance(address: string | null) {
  try {
    if (!address) return null;
    const rpc = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    const conn = new Connection(rpc, "confirmed");
    const lamports = await conn.getBalance(new PublicKey(address));
    return lamports / LAMPORTS_PER_SOL;
  } catch {
    return null;
  }
}

async function fetchOrder(id: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string;
  const supabase = createClient(url, key);

  const { data: order, error: e1 } = await supabase
    .from("volume_orders")
    .select("*")
    .eq("id", id)
    .single();
  if (e1) throw e1;

  const { data: tasks } = await supabase
    .from("volume_tasks")
    .select("id,wallet_address,status,cycles_completed,total_cycles,current_volume,last_transaction_at,interval_minutes")
    .eq("order_id", id);

  const { data: txs } = await supabase
    .from("transactions")
    .select("*")
    .in(
      "task_id",
      (tasks || []).map((t) => t.id),
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const perOrderBudget = await deriveOpsBudgetAddress(id);
  const treasuryOps = (process.env.TREASURY_OPERATIONS_ADDRESS || (await deriveTreasuryOpsAddress())) || null;
  const treasuryFees = process.env.TREASURY_FEES_ADDRESS || null;
  const paymentBal = await getSolBalance((order as any).payment_address || null);
  const budgetBal = await getSolBalance(perOrderBudget);
  const opsBal = await getSolBalance(treasuryOps);
  const feesBal = await getSolBalance(treasuryFees);
  const taskBalances = await Promise.all(
    (tasks || []).map(async (t: any) => ({
      id: t.id,
      wallet: t.wallet_address,
      balance: await getSolBalance(t.wallet_address),
    })),
  );

  return {
    order: order as Order,
    tasks: tasks || [],
    txs: (txs || []) as Transaction[],
    perOrderBudget,
    treasuryOps,
    treasuryFees,
    balances: {
      payment: paymentBal,
      budget: budgetBal,
      ops: opsBal,
      fees: feesBal,
      tasks: taskBalances,
    },
  };
}

export default async function OrderDetail({ params }: { params: { id: string } }) {
  const { order, tasks, txs, perOrderBudget, treasuryOps, treasuryFees, balances } = await fetchOrder(params.id);

  const solscan = (addr: string) => `https://solscan.io/account/${addr}`;
  const sigUrl = (sig: string) => `https://solscan.io/tx/${sig}`;
  const spentBuySol = txs.filter((t)=>t.type === "buy").reduce((acc, t)=>acc + (t.amount_sol || 0), 0);
  const estRemaining = Math.max(0, (order.total_cost || 0) - spentBuySol);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Order {order.id.slice(0,8)}…</h1>
          <div className="flex items-center gap-3">
            <form action={`/api/orders/${order.id}/resume`} method="post">
              <button type="submit" className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-sm">Resume</button>
            </form>
            <form action={`/api/orders/${order.id}/run-now`} method="post">
              <button type="submit" className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm">Run Now</button>
            </form>
            <Link href="/orders" className="text-blue-300 hover:underline">Back to Orders</Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-white/10 p-4 bg-white/5">
            <h2 className="font-semibold mb-3">Summary</h2>
            <div className="space-y-2 text-sm">
              <div>Status: <span className="font-mono">{order.status}</span></div>
              <div>Volume: ${order.volume_target.toLocaleString()}</div>
              <div>Duration: {order.duration_hours >= 24 ? `${order.duration_hours/24}d` : `${order.duration_hours}h`}</div>
              <div>Tasks: {order.tasks_count}</div>
              <div>Total Cost: {order.total_cost} SOL</div>
              <div>Estimated Remaining Spend: {estRemaining.toFixed(6)} SOL</div>
              <div>Created: {new Date(order.created_at).toLocaleString()}</div>
            </div>
            {estRemaining > 0 && (balances.budget == null || balances.budget < 0.001) && (
              <div className="mt-3 rounded bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 text-sm p-3">
                Per-order budget wallet has no SOL, but this order still has budget to deploy.
                {perOrderBudget && treasuryOps && (
                  <>
                    <div className="mt-2">
                      Send SOL from <a className="underline" href={solscan(treasuryOps)} target="_blank">Treasury Ops</a> to <a className="underline" href={solscan(perOrderBudget)} target="_blank">Per-Order Budget</a> to continue.
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-white/10 p-4 bg-white/5">
            <h2 className="font-semibold mb-3">Addresses</h2>
            <div className="space-y-2 text-sm">
              <div>
                Payment Address: { (order as any).payment_address ? (
                  <a className="text-blue-300 hover:underline" href={solscan(String((order as any).payment_address))} target="_blank">{String((order as any).payment_address)}</a>
                ) : "—"} {balances.payment != null && <span className="ml-2 text-neutral-400">({balances.payment.toFixed(6)} SOL)</span>}
              </div>
              <div>
                Per-Order Budget: {perOrderBudget ? (
                  <a className="text-blue-300 hover:underline" href={solscan(perOrderBudget)} target="_blank">{perOrderBudget}</a>
                ) : "—"} {balances.budget != null && <span className="ml-2 text-neutral-400">({balances.budget.toFixed(6)} SOL)</span>}
              </div>
              <div>
                Treasury Ops: {treasuryOps ? (
                  <a className="text-blue-300 hover:underline" href={solscan(treasuryOps)} target="_blank">{treasuryOps}</a>
                ) : "—"} {balances.ops != null && <span className="ml-2 text-neutral-400">({balances.ops.toFixed(6)} SOL)</span>}
              </div>
              <div>
                Treasury Fees: {treasuryFees ? (
                  <a className="text-blue-300 hover:underline" href={solscan(treasuryFees)} target="_blank">{treasuryFees}</a>
                ) : "—"} {balances.fees != null && <span className="ml-2 text-neutral-400">({balances.fees.toFixed(6)} SOL)</span>}
              </div>
              <div>
                Pool Address: {order.pool_address ? (
                  <a className="text-blue-300 hover:underline" href={solscan(order.pool_address)} target="_blank">{order.pool_address}</a>
                ) : "—"}
              </div>
            </div>
            <div className="mt-4">
              <form action={`/api/orders/${order.id}/fund`} method="post" className="flex items-center gap-2 text-sm">
                <input name="amount" placeholder="Amount (SOL)" className="bg-neutral-900 border border-white/10 rounded px-2 py-1 w-40" />
                <button type="submit" className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white">Fund Budget from Ops</button>
              </form>
              <div className="text-xs text-neutral-400 mt-1">Transfers SOL from Treasury Ops to the per-order budget wallet.</div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 p-4 bg-white/5">
          <h2 className="font-semibold mb-3">Funds Overview</h2>
          <div className="space-y-2 text-sm">
            {(() => {
              const paymentAddr = (order as any).payment_address || null;
              const rows = [
                { label: "Payment", address: paymentAddr, balance: balances.payment },
                { label: "Per-Order Budget", address: perOrderBudget, balance: balances.budget },
                { label: "Treasury Ops", address: treasuryOps, balance: balances.ops },
                { label: "Treasury Fees", address: treasuryFees, balance: balances.fees },
                ...tasks.map((t:any) => ({
                  label: `Task ${t.id.slice(0,8)}…`,
                  address: t.wallet_address,
                  balance: balances.tasks.find((b:any)=>b.id===t.id)?.balance ?? null,
                })),
              ].filter((r)=> typeof r.balance === 'number' && (r.balance as number) > 0 )
               .sort((a:any,b:any)=> (b.balance as number) - (a.balance as number));
              if (rows.length === 0) return <div className="text-neutral-400">No positive balances detected.</div>;
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {rows.map((r:any, idx:number)=> (
                    <div key={idx} className="flex items-center justify-between border border-white/10 rounded px-3 py-2 bg-white/5">
                      <div className="space-y-0.5">
                        <div className="text-neutral-300">{r.label}</div>
                        <a className="text-blue-300 hover:underline text-xs break-all" href={solscan(String(r.address))} target="_blank">{String(r.address)}</a>
                      </div>
                      <div className="font-mono">{(r.balance as number).toFixed(6)} SOL</div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 p-4 bg-white/5">
          <h2 className="font-semibold mb-3">Diagnostics</h2>
          <div className="space-y-2 text-sm">
            {(tasks as any[]).map((t:any)=>{
              const last = t.last_transaction_at ? new Date(t.last_transaction_at) : null;
              const minutes = Number(t.interval_minutes || 0);
              const next = last ? new Date(last.getTime() + minutes*60*1000) : null;
              const now = new Date();
              const overdue = next ? now > next : false;
              return (
                <div key={t.id} className="flex items-center justify-between border border-white/10 rounded px-3 py-2 bg-white/5">
                  <div className="space-y-1">
                    <div className="font-mono text-xs">Task {t.id.slice(0,8)}…</div>
                    <div>Interval: {minutes}m</div>
                    <div>Last Tx: {last ? last.toLocaleString() : "—"}</div>
                  </div>
                  <div className="text-right">
                    <div>Next Run: {next ? next.toLocaleTimeString() : "—"}</div>
                    {next && (
                      <div className={overdue ? "text-red-300" : "text-neutral-400"}>{overdue ? "Overdue" : "Scheduled"}</div>
                    )}
                  </div>
                </div>
              );
            })}
            {(tasks as any[]).length === 0 && <div className="text-neutral-400">No tasks.</div>}
            <div className="border border-white/10 rounded px-3 py-2 bg-white/5">
              Budget Status: {balances.budget != null ? `${balances.budget.toFixed(6)} SOL in per-order budget` : "—"}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 p-4 bg-white/5">
          <h2 className="font-semibold mb-3">Tasks</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-neutral-300">
                <tr>
                  <th className="text-left px-3 py-2">Task</th>
                  <th className="text-left px-3 py-2">Wallet</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Cycles</th>
                  <th className="text-left px-3 py-2">Last Tx</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t: any) => (
                  <tr key={t.id} className="border-t border-white/10">
                    <td className="px-3 py-2 font-mono text-xs">{t.id.slice(0,8)}…</td>
                    <td className="px-3 py-2">
                      <a className="text-blue-300 hover:underline" href={solscan(t.wallet_address)} target="_blank">{t.wallet_address.slice(0,8)}…</a>
                      {(() => {
                        const bal = balances.tasks.find((b:any)=>b.id===t.id)?.balance;
                        return bal != null ? <span className="ml-2 text-neutral-400">({bal.toFixed(6)} SOL)</span> : null;
                      })()}
                    </td>
                    <td className="px-3 py-2">{t.status}</td>
                    <td className="px-3 py-2">{t.cycles_completed}/{t.total_cycles}</td>
                    <td className="px-3 py-2">{t.last_transaction_at ? new Date(t.last_transaction_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
                {tasks.length === 0 && (
                  <tr><td className="px-3 py-4 text-neutral-400" colSpan={5}>No tasks.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 p-4 bg-white/5">
          <h2 className="font-semibold mb-3">Transactions</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-neutral-300">
                <tr>
                  <th className="text-left px-3 py-2">Signature</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">SOL</th>
                  <th className="text-left px-3 py-2">Tokens</th>
                  <th className="text-left px-3 py-2">Price</th>
                  <th className="text-left px-3 py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((tx) => (
                  <tr key={tx.id} className="border-t border-white/10">
                    <td className="px-3 py-2 font-mono text-xs">
                      <a className="text-blue-300 hover:underline" href={sigUrl(tx.signature)} target="_blank">{tx.signature.slice(0,8)}…</a>
                    </td>
                    <td className="px-3 py-2">{tx.type}</td>
                    <td className="px-3 py-2">{tx.amount_sol}</td>
                    <td className="px-3 py-2">{tx.amount_tokens}</td>
                    <td className="px-3 py-2">{tx.price}</td>
                    <td className="px-3 py-2">{new Date(tx.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {txs.length === 0 && (
                  <tr><td className="px-3 py-4 text-neutral-400" colSpan={6}>No transactions.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}


