"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateAlertRules } from "@/app/actions/products";
import AlertRuleFields, { useAlertRule } from "@/components/product/AlertRuleFields";
import type { PriceRange, PriceSuggestion } from "@/components/product/AlertStepper";
import { Button } from "@/components/ui/button";

type Props = {
  productId: string;
  currency: string;
  currentPrice: number;
  targetPrice: number | null;
  alertPct: number | null;
  /** Price history range, used to draw the phone's price scale. */
  range?: PriceRange | null;
  suggestion?: PriceSuggestion | null;
  onSaved?: () => void;
};

export default function AlertRulesForm({
  productId,
  currency,
  currentPrice,
  targetPrice,
  alertPct,
  range,
  suggestion,
  onSaved,
}: Props) {
  const rule = useAlertRule({ currentPrice, targetPrice, alertPct });
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateAlertRules({ productId, targetPrice: rule.target, alertPct: rule.pct });
      if (result.ok) {
        toast.success(result.message);
        onSaved?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <AlertRuleFields idPrefix={productId} currency={currency} currentPrice={currentPrice} range={range} suggestion={suggestion} rule={rule} />

      <div className="flex gap-2.5 sm:justify-end">
        {rule.hasRule && (
          <Button type="button" variant="outline" className="text-danger hover:text-danger max-md:h-12" onClick={rule.clear}>
            Clear<span className="max-md:hidden">&nbsp;rules</span>
          </Button>
        )}
        <Button type="submit" disabled={pending} className="max-md:h-12 max-md:flex-1 max-md:text-base">
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save alert
        </Button>
      </div>
    </form>
  );
}
