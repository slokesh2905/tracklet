import { ExternalLink, PackageX } from "lucide-react";
import CompareStoresButton from "@/components/product/CompareStoresButton";
import type { StoreOffer } from "@/lib/evidence";
import { formatPercent, formatPrice, percentChange, timeAgo } from "@/lib/format";
import { retailerName } from "@/lib/retailers";
import { cn } from "@/lib/utils";

export default function OtherStores({
  productId,
  offers,
  currentPrice,
  comparedAt,
}: {
  productId: string;
  offers: StoreOffer[];
  currentPrice: number;
  comparedAt: string | null;
}) {
  if (!comparedAt) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          We haven&apos;t checked other stores for this item yet. Comparing looks for the exact same product on Amazon,
          Flipkart, Myntra and more.
        </p>
        <CompareStoresButton productId={productId} className="w-full gap-2 sm:w-auto" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {offers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No other store was selling this exact item when we last looked.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {offers.map((o) => {
            const diff = percentChange(currentPrice, o.price);
            return (
              <li key={o.url}>
                <a
                  href={o.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="flex items-center gap-3 py-2.5 hover:opacity-80 pointer-coarse:py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {retailerName(o.retailer)}
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          o.match === "exact" ? "bg-success/12 text-success" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {o.match === "exact" ? "Same item" : "Similar"}
                      </span>
                    </p>
                    {!o.inStock && (
                      <p className="flex items-center gap-1 text-xs text-danger">
                        <PackageX className="size-3" /> Out of stock
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums">{formatPrice(o.price, o.currency)}</p>
                    {diff !== 0 && (
                      <p className={cn("text-xs", diff < 0 ? "text-success" : "text-muted-foreground")}>
                        {formatPercent(diff, { signed: true })} vs here
                      </p>
                    )}
                  </div>
                  <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" suppressHydrationWarning>
          Checked {timeAgo(comparedAt)}
        </p>
        <CompareStoresButton productId={productId} label="Check again" variant="secondary" className="gap-2" />
      </div>
    </div>
  );
}
