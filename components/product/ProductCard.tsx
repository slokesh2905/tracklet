"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import {
  BellRing,
  ExternalLink,
  FolderInput,
  ImageOff,
  MoreVertical,
  PackageX,
  PauseCircle,
  Target,
  Store,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { deleteProduct, moveToCollection } from "@/app/actions/products";
import SwipeRow from "@/components/SwipeRow";
import AlertRulesForm from "@/components/product/AlertRulesForm";
import AlertSheet from "@/components/product/AlertSheet";
import CollectionSheet from "@/components/product/CollectionSheet";
import { AllTimeLowBadge, ChangeBadge, DealBadge, DiscountCheckBadge, VerdictBadge } from "@/components/product/Badges";
import Sparkline from "@/components/product/Sparkline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DashboardProduct } from "@/lib/data";
import type { CollectionRow } from "@/lib/db/schema";
import { isDiscountFlagged } from "@/lib/discount-check";
import { formatPercent, formatPrice, hostname, percentChange, timeAgo } from "@/lib/format";
import { retailerName } from "@/lib/retailers";
import { deleteWithUndo } from "@/lib/undo";

type Props = {
  product: DashboardProduct;
  collections: Pick<CollectionRow, "id" | "name">[];
};

/** Swiping a card is the phone's way in to its actions; the desktop keeps the ⋮ menu. */
const isPhone = () => window.matchMedia("(max-width: 767px)").matches;

export default function ProductCard({ product, collections }: Props) {
  const [alertOpen, setAlertOpen] = useState(false);
  const [swipeOpen, setSwipeOpen] = useState(false);
  const [sheet, setSheet] = useState<"alert" | "move" | null>(null);
  const [removed, setRemoved] = useState(false);
  const [collectionId, setOptimisticCollection] = useOptimistic(product.collection_id ?? "none");
  const [, startTransition] = useTransition();

  const hasRule = product.target_price !== null || product.alert_pct !== null;
  const discount =
    product.original_price && product.original_price > product.current_price
      ? percentChange(product.original_price, product.current_price)
      : null;

  // Tick the new collection now; useOptimistic falls back to the server value if the move fails.
  function move(next: string) {
    startTransition(async () => {
      setOptimisticCollection(next);
      const result = await moveToCollection(product.id, next === "none" ? null : next);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  // The card only has the recent prices, which is enough to draw the alert's price scale.
  const range =
    product.spark.length > 1
      ? {
          low: Math.min(...product.spark),
          high: Math.max(...product.spark),
          average: product.spark.reduce((a, b) => a + b, 0) / product.spark.length,
        }
      : null;

  const closeThen = (fn: () => void) => () => {
    setSwipeOpen(false);
    fn();
  };

  function stopTracking() {
    setRemoved(true);
    deleteWithUndo({
      message: "Stopped tracking",
      commit: () => deleteProduct(product.id),
      restore: () => setRemoved(false),
    });
  }

  const badges: Array<{ node: React.ReactNode; desktopOnly?: boolean }> = [];
  const targetHit = product.target_price !== null && product.current_price <= product.target_price;
  // A reached target is the news, so it leads (and survives the phone's two-badge cap).
  if (targetHit) {
    badges.push({
      node: (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-xs font-medium text-primary">
          <Target className="size-3" /> Under {formatPrice(product.target_price!, product.currency)} target
        </span>
      ),
    });
  }
  if (!product.in_stock) {
    badges.push({
      node: (
        <span className="inline-flex items-center gap-1 rounded-full bg-danger/12 px-2 py-0.5 text-xs font-medium text-danger">
          <PackageX className="size-3" /> Out of stock
        </span>
      ),
    });
  }
  if (product.paused) {
    badges.push({
      node: (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          <PauseCircle className="size-3" /> Checks paused
        </span>
      ),
    });
  }
  // On a phone the change badge sits beside the price instead.
  badges.push({ node: <ChangeBadge status={product.status} percentChange={product.percentChange} />, desktopOnly: true });
  if (product.isAllTimeLow && product.status !== "new") badges.push({ node: <AllTimeLowBadge /> });
  // Ahead of the deal badge so it survives the two-badge cap on a phone.
  if (isDiscountFlagged(product.discountCheck)) badges.push({ node: <DiscountCheckBadge check={product.discountCheck} /> });
  if (product.status !== "new" && product.in_stock) badges.push({ node: <DealBadge score={product.dealScore} label={product.dealLabel} /> });
  if (product.verdict) badges.push({ node: <VerdictBadge verdict={product.verdict} /> });
  if (product.bestOffer && product.bestOffer.savingPct >= 3) {
    badges.push({
      node: (
        <span className="inline-flex items-center gap-1 rounded-full bg-chart-2/15 px-2 py-0.5 text-xs font-medium text-chart-2">
          <Store className="size-3" /> Cheaper on {retailerName(product.bestOffer.retailer)} ·{" "}
          {formatPrice(product.bestOffer.price, product.currency)}
        </span>
      ),
    });
  }
  if (product.shoppers > 1) {
    badges.push({
      node: (
        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
          <Users className="size-3" /> {product.shoppers} tracking
        </span>
      ),
    });
  }
  if (hasRule && !targetHit) {
    badges.push({
      node: (
        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
          <Target className="size-3" />
          {product.target_price !== null
            ? `Target ${formatPrice(product.target_price, product.currency)}`
            : `−${product.alert_pct}% alert`}
        </span>
      ),
    });
  }

  return (
    <SwipeRow
      open={swipeOpen}
      onOpenChange={setSwipeOpen}
      enabled={isPhone}
      frameClassName={removed ? "hidden" : "rounded-xl md:overflow-visible"}
      actionsClassName="md:hidden"
      className="rounded-xl"
      actions={[
        { label: "Alert", icon: BellRing, className: "bg-primary text-primary-foreground", onClick: closeThen(() => setSheet("alert")) },
        { label: "Move", icon: FolderInput, className: "bg-foreground/70 text-background", onClick: closeThen(() => setSheet("move")) },
        { label: "Stop tracking", icon: Trash2, className: "bg-danger text-white", onClick: closeThen(stopTracking) },
      ]}
    >
      <article hidden={removed} className="group relative flex flex-col rounded-xl border bg-card p-3 shadow-xs transition-[box-shadow,scale,opacity] hover:shadow-md sm:p-4">
        <div className="flex gap-3">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white max-md:rounded-xl sm:size-20">
            {product.image_url ? (
              // Retailer images come from arbitrary hosts; plain img avoids optimiser allow-lists.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image_url} alt="" loading="lazy" className="size-full object-contain p-1" />
            ) : (
              <ImageOff className="size-5 text-muted-foreground" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-1">
              <Link
                href={`/products/${product.id}`}
                data-press-delegate="article"
                draggable={false}
                className="line-clamp-2 flex-1 text-[0.9375rem] leading-snug font-medium after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none md:text-sm lg:text-[15px]"
              >
                {product.name}
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="relative z-10 -mt-1 -mr-1 shrink-0 max-md:hidden pointer-coarse:size-11 pointer-coarse:-mt-2.5 pointer-coarse:-mr-2.5" aria-label="Product actions">
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onSelect={() => setAlertOpen(true)}>
                    <BellRing /> Price alert…
                  </DropdownMenuItem>
                  {collections.length > 0 && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <FolderInput className="mr-2 size-4 text-muted-foreground" /> Collection
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuRadioGroup value={collectionId} onValueChange={move}>
                          <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
                          {collections.map((c) => (
                            <DropdownMenuRadioItem key={c.id} value={c.id}>
                              {c.name}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )}
                  <DropdownMenuItem asChild>
                    <a href={product.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink /> View on {hostname(product.url)}
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={stopTracking}>
                    <Trash2 /> Stop tracking
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {hostname(product.url)}
              {product.last_checked_at && (
                <span suppressHydrationWarning>
                  {" · "}
                  <span className="max-md:hidden">checked </span>
                  {timeAgo(product.last_checked_at)}
                </span>
              )}
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 md:items-baseline">
              <span className="text-lg font-bold tabular-nums md:text-xl">
                {formatPrice(product.current_price, product.currency)}
              </span>
              {/* On a phone the change and the trend sit beside the price, where they're read first. */}
              <span className="md:hidden">
                <ChangeBadge status={product.status} percentChange={product.percentChange} />
              </span>
              {discount !== null && (
                <span className="text-xs text-muted-foreground max-md:hidden">
                  <s>{formatPrice(product.original_price!, product.currency)}</s>{" "}
                  <span className="text-success">{formatPercent(discount, { signed: true })}</span>
                </span>
              )}
              <Sparkline
                values={product.spark}
                dot
                className={`ml-auto w-15 shrink-0 md:hidden ${product.status === "new" ? "text-chart-2" : ""}`}
              />
            </div>
          </div>
        </div>

        <Sparkline values={product.spark} className="mt-3 max-md:hidden" />

        {badges.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {/* Phones show the two most useful badges; the full set is one tap away on the product page. */}
            {badges.map((badge, i) => {
              const phoneRank = badges.slice(0, i).filter((b) => !b.desktopOnly).length;
              const hiddenOnPhone = badge.desktopOnly || phoneRank >= 2;
              return (
                <span key={i} className={hiddenOnPhone ? "contents max-md:hidden" : "contents"}>
                  {badge.node}
                </span>
              );
            })}
          </div>
        )}

        <Dialog open={alertOpen} onOpenChange={setAlertOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Price alert</DialogTitle>
              <DialogDescription className="line-clamp-2">{product.name}</DialogDescription>
            </DialogHeader>
            <AlertRulesForm
              productId={product.id}
              currency={product.currency}
              currentPrice={product.current_price}
              targetPrice={product.target_price}
              alertPct={product.alert_pct}
              onSaved={() => setAlertOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </article>

      <AlertSheet
        open={sheet === "alert"}
        onOpenChange={(o) => setSheet(o ? "alert" : null)}
        productId={product.id}
        name={product.name}
        imageUrl={product.image_url}
        currency={product.currency}
        currentPrice={product.current_price}
        isAllTimeLow={product.isAllTimeLow}
        targetPrice={product.target_price}
        alertPct={product.alert_pct}
        range={range}
        suggestion={
          product.bestOffer ? { label: `${retailerName(product.bestOffer.retailer)} price`, price: product.bestOffer.price } : null
        }
      />
      <CollectionSheet
        open={sheet === "move"}
        onOpenChange={(o) => setSheet(o ? "move" : null)}
        collections={collections}
        value={collectionId === "none" ? null : collectionId}
        onChange={(id) => move(id ?? "none")}
      />
    </SwipeRow>
  );
}
