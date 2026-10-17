import { CircleCheck, CircleHelp, ShieldAlert, type LucideIcon } from "lucide-react";
import type { DiscountCheck } from "@/lib/discount-check";
import { formatDate, formatPercent, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  check: DiscountCheck;
  currency: string;
  originalPrice: number | null;
  /** Discount off the list price in percent (positive = cheaper). */
  discountPct: number | null;
  firstSeen: string;
};

type Copy = { icon: LucideIcon; tone: string; title: string; body: string };

function describe(check: DiscountCheck, { currency, originalPrice, discountPct }: Props): Copy | null {
  const p = (n: number) => formatPrice(n, currency);
  const list = originalPrice !== null ? p(originalPrice) : "the list price";
  const off = discountPct !== null ? `${formatPercent(discountPct)} off` : "the discount";

  switch (check.status) {
    case "none":
      return null;
    case "unknown":
      return {
        icon: CircleHelp,
        tone: "bg-muted text-muted-foreground",
        title: "Too early to tell",
        body: `We have only watched this for ${check.daysTracked} day${check.daysTracked === 1 ? "" : "s"}. After a week we can say whether ${list} was ever really charged.`,
      };
    case "verified":
      return {
        icon: CircleCheck,
        tone: "bg-success/12 text-success",
        title: "The list price was charged",
        body: `In the ${check.daysTracked} days we have tracked this, it sold at or close to ${list}, so ${off} is measured against a real price.`,
      };
    case "unverified":
      return {
        icon: ShieldAlert,
        tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        title: "We have not seen the list price charged",
        body: `The highest price in the ${check.daysTracked} days we have tracked is ${p(check.highestSeen)}, well below ${list}. ${
          check.firm ? `The ${off} figure likely overstates the saving.` : "Check back after a month for a firmer answer."
        }`,
      };
    case "inflated":
      return {
        icon: ShieldAlert,
        tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        title: "The price went up before this drop",
        body: `It rose from ${p(check.from)} to ${p(check.peak)}, then fell back to ${p(check.from)} ${
          check.daysAgo === 0 ? "today" : `${check.daysAgo} day${check.daysAgo === 1 ? "" : "s"} ago`
        }. The drop is not a saving against where it started.`,
      };
  }
}

export default function DiscountCheckPanel(props: Props) {
  const copy = describe(props.check, props);
  if (!copy) return null;
  const Icon = copy.icon;

  return (
    <div className="flex items-start gap-3">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[0.625rem]", copy.tone)}>
        <Icon className="size-[1.125rem]" />
      </span>
      <div className="min-w-0">
        <p className="text-[0.9375rem] font-semibold">{copy.title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{copy.body}</p>
        <p className="mt-2 text-xs text-muted-foreground" suppressHydrationWarning>
          Based only on prices recorded since {formatDate(props.firstSeen)}.
        </p>
      </div>
    </div>
  );
}
