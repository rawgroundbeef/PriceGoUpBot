import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    console.log("url", url);
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string;
    console.log("key", key);
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase env not configured" }, { status: 500 });
    }

    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("volume_orders")
      .select(
        "id,user_id,token_address,pool_address,volume_target,duration_hours,tasks_count,total_cost,status,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ orders: data || [] });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}


