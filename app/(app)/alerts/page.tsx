import Link from "next/link";
import { BellOff, ImageOff, Mail, MessageSquare } from "lucide-react";
import MarkAllRead from "@/components/app/MarkAllRead";
import { ALERT_COPY } from "@/lib/alerts";
import { getAlerts } from "@/lib/data";
import { formatPercent, formatPrice, percentChange, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Alerts" };

export default async function AlertsPage() {
  const alerts = await getAlerts();
  const unread = alerts.filter((a) => !a.read_at).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
          <p className="text-sm text-muted-foreground">
            {unread > 0 ? `${unread} new` : "Every alert we’ve sent you"}
          </p>
        </div>
        {unread > 0 && <MarkAllRead />}
      </div>

      {alerts.length === 0 ? (
        <section className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
          <BellOff className="size-12 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">No alerts yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            When a price hits your target or drops, it shows up here and in your inbox.
          </p>
        </section>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
          {alerts.map((a) => {
            const copy = ALERT_COPY[a.kind];
            const change = a.old_price ? percentChange(Number(a.old_price), Number(a.new_price)) : 0;
            return (
              <li key={a.id} className={cn("border-b last:border-b-0", !a.read_at && "bg-primary/5")}>
                <Link href={`/products/${a.product_id}`} className="flex items-center gap-3 p-3 hover:bg-accent/50 sm:p-4">
                  <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white">
                    {a.products?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.products.image_url} alt="" loading="lazy" className="size-full object-contain p-1" />
                    ) : (
                      <ImageOff className="size-4 text-muted-foreground" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {!a.read_at && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                      {copy.emoji} {copy.title}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{a.products?.name ?? "Deleted product"}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span suppressHydrationWarning>{timeAgo(a.created_at)}</span>
                      {a.channels.includes("email") && <Mail className="size-3" aria-label="Sent by email" />}
                      {a.channels.includes("discord") && <MessageSquare className="size-3" aria-label="Sent to Discord" />}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums">{formatPrice(Number(a.new_price), a.currency)}</p>
                    {change !== 0 && (
                      <p className={cn("text-xs", change < 0 ? "text-success" : "text-danger")}>
                        {formatPercent(change, { signed: true })}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
