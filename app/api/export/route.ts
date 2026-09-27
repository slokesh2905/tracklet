import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { toCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import { priceHistory, products } from "@/lib/db/schema";
import { getUser } from "@/lib/session";

/** CSV of every tracked product and its full price history (one row per price point). */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tracked = await db.query.products.findMany({
    columns: { target_price: true, created_at: true },
    where: eq(products.user_id, user.id),
    orderBy: asc(products.created_at),
    with: {
      item: {
        columns: { name: true, url: true, currency: true, current_price: true, lowest_price: true, highest_price: true },
        with: {
          priceHistory: {
            columns: { price: true, checked_at: true, in_stock: true },
            orderBy: asc(priceHistory.checked_at),
          },
        },
      },
    },
  });
  const rows = tracked.map(({ item, ...t }) => ({ ...t, ...item }));

  const out: Array<Array<string | number | boolean | null>> = [];
  for (const p of rows) {
    const history = p.priceHistory.length
      ? p.priceHistory
      : [{ price: p.current_price, checked_at: p.created_at, in_stock: null }];
    for (const h of history) {
      out.push([p.name, p.url, p.currency, h.checked_at, h.price, h.in_stock, p.current_price, p.target_price, p.lowest_price, p.highest_price]);
    }
  }

  const csv = toCsv(
    ["product", "url", "currency", "checked_at", "price", "in_stock", "current_price", "target_price", "lowest_price", "highest_price"],
    out
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
