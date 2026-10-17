import { ExternalLink, PackageX } from "lucide-react";
import CompareStoresButton from "@/components/product/CompareStoresButton";
import type { StoreOffer } from "@/lib/evidence";
import { formatPrice, timeAgo } from "@/lib/format";
import { retailerName } from "@/lib/retailers";
import { cn } from "@/lib/utils";

export default function OtherStores({
  productId,
  offers,
  currentPrice,
  currency,
  comparedAt,
}: {
  productId: string;
  offers: StoreOffer[];
  currentPrice: number;
  currency: string;
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
            const diff = o.price - currentPrice;
            return (
              <li key={o.url}>
                <a
                  href={o.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="flex min-h-14 items-center gap-3 py-2 hover:opacity-80"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[0.9375rem] font-medium">
                      {retailerName(o.retailer)}
                      <span
                        className={cn(
                          "rounded-full px-[0.4375rem] py-px text-[0.6875rem] font-medium",
                          o.match === "exact" ? "bg-chart-2/15 text-chart-2" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {o.match === "exact" ? "Exact" : "Similar"}
                      </span>
                    </p>
                    {o.inStock ? (
                      <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                        In stock · checked {timeAgo(o.checkedAt)}
                      </p>
                    ) : (
                      <p className="flex items-center gap-1 text-xs text-danger">
                        <PackageX className="size-3" /> Out of stock
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[0.9375rem] font-semibold tabular-nums">{formatPrice(o.price, o.currency)}</p>
                    {/* A money difference only makes sense in the same currency. */}
                    {diff !== 0 && o.currency === currency && (
                      <p className={cn("text-xs font-medium tabular-nums", diff < 0 ? "text-success" : "text-danger")}>
                        {diff < 0 ? "−" : "+"}
                        {formatPrice(Math.abs(diff), o.currency).replace(/\.00$/, "")}
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
