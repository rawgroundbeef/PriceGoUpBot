"use client";

import { useOrdersQuery } from "../hooks/useOrdersQuery";

function formatVolume(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v}`;
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "running"
      ? "bg-emerald-500/20 text-emerald-300"
      : status === "payment_confirmed"
      ? "bg-blue-500/20 text-blue-300"
      : status === "pending_payment"
      ? "bg-yellow-500/20 text-yellow-300"
      : status === "failed"
      ? "bg-rose-500/20 text-rose-300"
      : status === "paused"
      ? "bg-zinc-500/20 text-zinc-300"
      : status === "completed"
      ? "bg-purple-500/20 text-purple-300"
      : "bg-slate-500/20 text-slate-300";
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${color}`}>
      {status.replace("_", " ")}
    </span>
  );
}

import Link from "next/link";

export default function OrdersTable() {
  const { orders, loading, error } = useOrdersQuery();

  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full text-sm">
        <thead className="bg-white/5 text-neutral-300">
          <tr>
            <th className="text-left px-4 py-3">ID</th>
            <th className="text-left px-4 py-3">User</th>
            <th className="text-left px-4 py-3">Volume</th>
            <th className="text-left px-4 py-3">Duration</th>
            <th className="text-left px-4 py-3">Tasks</th>
            <th className="text-left px-4 py-3">Cost</th>
            <th className="text-left px-4 py-3">Status</th>
            <th className="text-left px-4 py-3">Created</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td className="px-4 py-6 text-neutral-400" colSpan={8}>
                Loading orders…
              </td>
            </tr>
          )}
          {error && (
            <tr>
              <td className="px-4 py-6 text-rose-400" colSpan={8}>
                {error}
              </td>
            </tr>
          )}
          {!loading && !error && orders.map((o) => (
            <tr key={o.id} className="border-t border-white/10 hover:bg-white/5">
              <td className="px-4 py-3 font-mono text-xs">
                <Link href={`/orders/${o.id}`} className="text-blue-300 hover:underline">
                  {o.id.slice(0,8)}…
                </Link>
              </td>
              <td className="px-4 py-3">{o.user_id.slice(0,8)}…</td>
              <td className="px-4 py-3">{formatVolume(o.volume_target)}</td>
              <td className="px-4 py-3">{o.duration_hours >= 24 ? `${o.duration_hours/24}d` : `${o.duration_hours}h`}</td>
              <td className="px-4 py-3">{o.tasks_count}</td>
              <td className="px-4 py-3">{o.total_cost} SOL</td>
              <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
              <td className="px-4 py-3">{new Date(o.created_at).toLocaleString()}</td>
            </tr>
          ))}
          {!loading && !error && orders.length === 0 && (
            <tr>
              <td className="px-4 py-6 text-neutral-400" colSpan={8}>No orders found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}


