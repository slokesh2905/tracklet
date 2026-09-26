"use client";

import { useState } from "react";
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
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { deleteProduct, moveToCollection } from "@/app/actions/products";
import ConfirmDialog from "@/components/ConfirmDialog";
import AlertRulesForm from "@/components/product/AlertRulesForm";
import { AllTimeLowBadge, ChangeBadge, DealBadge, VerdictBadge } from "@/components/product/Badges";
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
import type { CollectionRow } from "@/lib/database.types";
import { formatPercent, formatPrice, hostname, percentChange, timeAgo } from "@/lib/format";

type Props = {
  product: DashboardProduct;
  collections: Pick<CollectionRow, "id" | "name">[];
};

export default function ProductCard({ product, collections }: Props) {
  const [alertOpen, setAlertOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removed, setRemoved] = useState(false);

  if (removed) return null;

  const hasRule = product.target_price !== null || product.alert_pct !== null;
  const discount =
    product.original_price && product.original_price > product.current_price
      ? percentChange(product.original_price, product.current_price)
      : null;

  async function move(collectionId: string) {
    const result = await moveToCollection(product.id, collectionId === "none" ? null : collectionId);
    if (result.ok) toast.success(result.message);
    else toast.error(result.error);
  }

  return (
    <article className="group relative flex flex-col rounded-xl border bg-card p-3 shadow-xs transition-shadow hover:shadow-md sm:p-4">
      <div className="flex gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white sm:size-20">
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
              className="line-clamp-2 flex-1 text-sm leading-snug font-medium after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none sm:text-[15px]"
            >
              {product.name}
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="relative z-10 -mt-1 -mr-1 shrink-0" aria-label="Product actions">
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
                      <DropdownMenuRadioGroup value={product.collection_id ?? "none"} onValueChange={move}>
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
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
                  <Trash2 /> Stop tracking
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {hostname(product.url)}
            {product.last_checked_at && (
              <span suppressHydrationWarning> · checked {timeAgo(product.last_checked_at)}</span>
            )}
          </p>

          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
            <span className="text-xl font-bold tracking-tight">
              {formatPrice(product.current_price, product.currency)}
            </span>
            {discount !== null && (
              <span className="text-xs text-muted-foreground">
                <s>{formatPrice(product.original_price!, product.currency)}</s>{" "}
                <span className="text-success">{formatPercent(discount, { signed: true })}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <Sparkline values={product.spark} className="mt-3" />

      <div className="mt-2 flex flex-wrap gap-1.5">
        {!product.in_stock && (
          <span className="inline-flex items-center gap-1 rounded-full bg-danger/12 px-2 py-0.5 text-xs font-medium text-danger">
            <PackageX className="size-3" /> Out of stock
          </span>
        )}
        {product.paused && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            <PauseCircle className="size-3" /> Checks paused
          </span>
        )}
        <ChangeBadge status={product.status} percentChange={product.percentChange} />
        {product.isAllTimeLow && product.status !== "new" && <AllTimeLowBadge />}
        {product.status !== "new" && <DealBadge score={product.dealScore} label={product.dealLabel} />}
        {product.verdict && <VerdictBadge verdict={product.verdict} />}
        {hasRule && (
          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
            <Target className="size-3" />
            {product.target_price !== null
              ? `≤ ${formatPrice(product.target_price, product.currency)}`
              : `−${product.alert_pct}%`}
          </span>
        )}
      </div>

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

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Stop tracking this product?"
        description="Its price history and alerts will be deleted. This can't be undone."
        confirmLabel="Stop tracking"
        destructive
        onConfirm={async () => {
          const result = await deleteProduct(product.id);
          if (result.ok) {
            setRemoved(true);
            toast.success(result.message);
          } else {
            toast.error(result.error);
          }
        }}
      />
    </article>
  );
}
