import { ImageResponse } from "next/og";
import { formatPercent, formatPrice, hostname, percentChange } from "@/lib/format";
import { getSharedProduct } from "@/lib/supabase/public";

export const alt = "Price history on Tracklet";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ORANGE = "#f97316";

function sparkPath(values: number[], w: number, h: number) {
  if (values.length < 2) return `M0 ${h / 2} H${w}`;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const step = w / (values.length - 1);
  const y = (v: number) => h - ((v - min) / span) * h;
  return values.reduce(
    (d, v, i) => (i === 0 ? `M0 ${y(v)}` : `${d} H${i * step} V${y(v)}`),
    ""
  );
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getSharedProduct(slug);

  const name = product?.name ?? "Price history";
  const current = product ? Number(product.current_price) : 0;
  const prices = product?.history.map((h) => Number(h.price)) ?? [];
  const first = prices[0] ?? current;
  const change = percentChange(first, current);

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#0a0a0a", color: "#fafafa", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 700 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: ORANGE, display: "flex" }} />
          Tracklet
          {product && <span style={{ marginLeft: "auto", fontSize: 26, fontWeight: 400, color: "#a3a3a3" }}>{hostname(product.url)}</span>}
        </div>

        <div style={{ display: "flex", marginTop: 48, fontSize: 52, fontWeight: 700, lineHeight: 1.15, maxHeight: 180, overflow: "hidden" }}>
          {name.length > 80 ? `${name.slice(0, 77)}…` : name}
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 88, fontWeight: 800, color: ORANGE }}>
              {product ? formatPrice(current, product.currency) : ""}
            </span>
            {change !== 0 && (
              <span style={{ fontSize: 34, color: change < 0 ? "#4ade80" : "#f87171" }}>
                {formatPercent(change, { signed: true })} since tracking began
              </span>
            )}
          </div>
          <svg width="420" height="160" viewBox="0 0 420 160">
            <path d={sparkPath(prices.length ? [...prices, current] : [current, current], 420, 150)} fill="none" stroke={ORANGE} strokeWidth="6" transform="translate(0,5)" />
          </svg>
        </div>
      </div>
    ),
    size
  );
}
