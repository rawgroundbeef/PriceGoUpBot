import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string;
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase env not configured" }, { status: 500 });
    }

    const supabase = createClient(url, key);

    // Reset order to running if not already, and clear failed tasks back to pending
    const { data: order, error: orderErr } = await supabase
      .from("volume_orders")
      .select("id,status")
      .eq("id", id)
      .single();
    if (orderErr || !order) return NextResponse.json({ error: orderErr?.message || "Order not found" }, { status: 404 });

    // Update order status and timestamps
    const updates: Record<string, unknown> = { status: "running", updated_at: new Date().toISOString() };
    if (!order.started_at) {
      (updates as any).started_at = new Date().toISOString();
    }
    const { error: updErr } = await supabase
      .from("volume_orders")
      .update(updates)
      .eq("id", id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    // Reset failed tasks to pending
    const { error: taskErr } = await supabase
      .from("volume_tasks")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .eq("order_id", id)
      .in("status", ["failed", "paused", "cancelled"]);
    if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}


