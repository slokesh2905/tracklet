"use client";

import { useEffect, useState } from "react";
import { BellRing, ChevronRight, ExternalLink } from "lucide-react";
import AlertRulesForm from "@/components/product/AlertRulesForm";
import type { PriceRange } from "@/components/product/AlertStepper";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatPrice, hostname } from "@/lib/format";

const OPEN_ALERT = "tracklet:open-alert";

type Props = {
  productId: string;
  name: string;
  url: string;
  currency: string;
  currentPrice: number;
  targetPrice: number | null;
  alertPct: number | null;
  range: PriceRange | null;
};

/**
 * Phone-only: the store button and the alert sit in a floating glass capsule, in the spot the
 * tab bar occupies elsewhere. It also owns the alert sheet, which the "Alert" row below can open.
 */
export default function ProductBar({ productId, name, url, currency, currentPrice, targetPrice, alertPct, range }: Props) {
  const [open, setOpen] = useState(false);
  const hasRule = targetPrice !== null || alertPct !== null;

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_ALERT, show);
    return () => window.removeEventListener(OPEN_ALERT, show);
  }, []);

  return (
    <>
      <div className="glass fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-40 flex gap-1.5 rounded-3xl border border-glass-edge p-1.5 shadow-lg shadow-black/10 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Price alert"
          className="relative flex h-13 w-[3.375rem] shrink-0 items-center justify-center rounded-[1.1875rem] bg-foreground/[0.07]"
        >
          <BellRing className="size-5" />
          {hasRule && <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-primary ring-2 ring-background/80" />}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-13 flex-1 items-center justify-center gap-2 rounded-[1.1875rem] bg-primary text-base font-semibold text-primary-foreground"
        >
          <ExternalLink className="size-[1.0625rem]" /> View on {hostname(url)}
        </a>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle className="text-xl tracking-tight">Price alert</SheetTitle>
            <SheetDescription className="truncate">
              {name} · now {formatPrice(currentPrice, currency)}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4">
            <AlertRulesForm
              productId={productId}
              currency={currency}
              currentPrice={currentPrice}
              targetPrice={targetPrice}
              alertPct={alertPct}
              range={range}
              onSaved={() => setOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** The "Alert at …" row in the page's settings list. */
export function AlertRow({ currency, targetPrice, alertPct }: { currency: string; targetPrice: number | null; alertPct: number | null }) {
  const title =
    targetPrice !== null
      ? `Alert at ${formatPrice(targetPrice, currency)} or below`
      : alertPct !== null
        ? `Alert on a ${alertPct}% drop`
        : "Alert on every drop";
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_ALERT))}
      className="flex w-full items-center gap-3 px-3.5 py-3 text-left md:hidden"
    >
      <span className="flex size-[2.125rem] shrink-0 items-center justify-center rounded-[0.625rem] bg-primary/12 text-primary">
        <BellRing className="size-[1.0625rem]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">Plus new lows and restocks</span>
      </span>
      <span className="flex items-center text-sm font-medium text-primary">
        Edit <ChevronRight className="size-4" />
      </span>
    </button>
  );
}
