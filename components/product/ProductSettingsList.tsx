"use client";

import { useOptimistic, useState, useTransition } from "react";
import { ChevronRight, FolderHeart, Globe, Lock } from "lucide-react";
import { toast } from "sonner";
import { moveToCollection } from "@/app/actions/products";
import { SHEET_CLOSE } from "@/components/product/AlertSheet";
import CollectionSheet from "@/components/product/CollectionSheet";
import { AlertRow } from "@/components/product/ProductBar";
import ProductShare from "@/components/product/ProductShare";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { CollectionRow } from "@/lib/db/schema";

type Props = {
  productId: string;
  name: string;
  currency: string;
  targetPrice: number | null;
  alertPct: number | null;
  slug: string;
  isPublic: boolean;
  collectionId: string | null;
  collections: Pick<CollectionRow, "id" | "name">[];
};

const row = "flex w-full items-center gap-3 border-t px-3.5 py-3 text-left";
const badge = "flex size-[2.125rem] shrink-0 items-center justify-center rounded-[0.625rem]";

/** Phone-only list of what's set on this product; each row opens its own sheet. */
export default function ProductSettingsList({
  productId,
  name,
  currency,
  targetPrice,
  alertPct,
  slug,
  isPublic,
  collectionId,
  collections,
}: Props) {
  const [shareOpen, setShareOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [current, setCurrent] = useOptimistic(collectionId);
  const [, startTransition] = useTransition();
  const collection = collections.find((c) => c.id === current)?.name ?? "None";

  function move(next: string | null) {
    startTransition(async () => {
      setCurrent(next);
      const r = await moveToCollection(productId, next);
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card md:hidden">
      <AlertRow currency={currency} targetPrice={targetPrice} alertPct={alertPct} />

      <button type="button" onClick={() => setShareOpen(true)} className={row}>
        <span className={`${badge} ${isPublic ? "bg-chart-2/15 text-chart-2" : "bg-muted text-muted-foreground"}`}>
          {isPublic ? <Globe className="size-[1.0625rem]" /> : <Lock className="size-[1.0625rem]" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-medium">{isPublic ? "Public link on" : "Public link off"}</span>
          <span className="block text-xs text-muted-foreground">
            {isPublic ? "Anyone with the link sees the history" : "Only you can see this history"}
          </span>
        </span>
        <span className="text-sm font-medium text-primary">{isPublic ? "Share" : "Turn on"}</span>
      </button>

      <button type="button" onClick={() => setMoveOpen(true)} className={row}>
        <span className={`${badge} bg-muted`}>
          <FolderHeart className="size-[1.0625rem] text-muted-foreground" />
        </span>
        <span className="flex-1 text-[0.9375rem] font-medium">Collection</span>
        <span className="max-w-[45%] truncate text-sm text-muted-foreground">{collection}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>

      <Sheet open={shareOpen} onOpenChange={setShareOpen}>
        <SheetContent
          side="bottom"
          closeClassName={SHEET_CLOSE}
          className="rounded-t-2xl px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="p-0 pt-2">
            <SheetTitle className="text-xl tracking-tight">Share</SheetTitle>
            <SheetDescription className="sr-only">Turn the public price page on or off and share its link.</SheetDescription>
          </SheetHeader>
          <ProductShare productId={productId} slug={slug} isPublic={isPublic} name={name} />
        </SheetContent>
      </Sheet>

      <CollectionSheet open={moveOpen} onOpenChange={setMoveOpen} collections={collections} value={current} onChange={move} />
    </div>
  );
}
