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
    // Force next cycle: set last_transaction_at far in the past for running/pending tasks
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString();
    const { error: taskErr } = await supabase
      .from("volume_tasks")
      .update({ last_transaction_at: past, updated_at: new Date().toISOString() })
      .eq("order_id", id)
      .in("status", ["running", "pending"]);
    if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}


