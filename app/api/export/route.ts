import { NextResponse } from "next/server";
import { toCsv } from "@/lib/csv";
import { createClient, getUser } from "@/lib/supabase/server";

/** CSV of every tracked product and its full price history (one row per price point). */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("name, url, currency, current_price, target_price, lowest_price, highest_price, created_at, price_history(price, checked_at, in_stock)")
    .order("created_at");
  if (error) return NextResponse.json({ error: "Export failed" }, { status: 500 });

  const rows: Array<Array<string | number | boolean | null>> = [];
  for (const p of data ?? []) {
    const history = [...p.price_history].sort((a, b) => a.checked_at.localeCompare(b.checked_at));
    for (const h of history.length ? history : [{ price: p.current_price, checked_at: p.created_at, in_stock: null }]) {
      rows.push([p.name, p.url, p.currency, h.checked_at, h.price, h.in_stock, p.current_price, p.target_price, p.lowest_price, p.highest_price]);
    }
  }

  const csv = toCsv(
    ["product", "url", "currency", "checked_at", "price", "in_stock", "current_price", "target_price", "lowest_price", "highest_price"],
    rows
  );
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tracklet-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
