"use client";

import { ImageOff } from "lucide-react";
import AlertRulesForm from "@/components/product/AlertRulesForm";
import type { PriceRange, PriceSuggestion } from "@/components/product/AlertStepper";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatPrice } from "@/lib/format";

/** The round 36px close button the phone sheets share. */
export const SHEET_CLOSE =
  "top-[1.375rem] right-5 flex size-9 items-center justify-center rounded-full bg-foreground/[0.06] opacity-100 [&_svg]:size-[1.125rem] [&_svg]:text-muted-foreground";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  name: string;
  imageUrl: string | null;
  currency: string;
  currentPrice: number;
  isAllTimeLow: boolean;
  targetPrice: number | null;
  alertPct: number | null;
  range: PriceRange | null;
  suggestion?: PriceSuggestion | null;
};

/** The phone's price alert: which product, then the stepper and price scale. */
export default function AlertSheet({
  open,
  onOpenChange,
  productId,
  name,
  imageUrl,
  currency,
  currentPrice,
  isAllTimeLow,
  targetPrice,
  alertPct,
  range,
  suggestion,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        closeClassName={SHEET_CLOSE}
        className="max-h-[92dvh] gap-3.5 overflow-y-auto rounded-t-2xl px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="p-0 pt-2">
          <SheetTitle className="text-xl tracking-tight">Price alert</SheetTitle>
          <SheetDescription className="sr-only">
            {name} · now {formatPrice(currentPrice, currency)}
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-2.5 rounded-xl bg-foreground/[0.04] p-2">
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[0.625rem] border bg-white">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="size-full object-contain p-0.5" />
            ) : (
              <ImageOff className="size-4 text-muted-foreground" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block text-xs text-muted-foreground tabular-nums">
              Now {formatPrice(currentPrice, currency)}
              {isAllTimeLow && " · all-time low"}
            </span>
          </span>
        </div>

        <AlertRulesForm
          productId={productId}
          currency={currency}
          currentPrice={currentPrice}
          targetPrice={targetPrice}
          alertPct={alertPct}
          range={range}
          suggestion={suggestion}
          onSaved={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
