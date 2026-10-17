import { PackageCheck, Target, TrendingDown, Trophy } from "lucide-react";
import type { AlertKind } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

const ICONS = {
  target_reached: Target,
  back_in_stock: PackageCheck,
  all_time_low: Trophy,
  price_drop: TrendingDown,
} satisfies Record<AlertKind, typeof Target>;

/** In-app stand-in for the emoji used in email and Discord, so icons stay one visual family. */
export default function AlertKindIcon({ kind, className }: { kind: AlertKind; className?: string }) {
  const Icon = ICONS[kind];
  return <Icon aria-hidden className={cn("size-4 shrink-0 text-primary", className)} />;
}
