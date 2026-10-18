"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { CircleCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { refreshAllProducts } from "@/app/actions/products";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The daily price check runs at 06:00 UTC (see vercel.ts). */
const CHECK_HOUR_UTC = 6;

function untilNextCheck() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), CHECK_HOUR_UTC));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  const mins = Math.ceil((next.getTime() - now.getTime()) / 60_000);
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const everyMinute = (onChange: () => void) => {
  const timer = setInterval(onChange, 60_000);
  return () => clearInterval(timer);
};

/** Pages read at once by the check (see refreshAllProducts); used to size the progress bar's run. */
const CONCURRENCY = 3;
const SECONDS_PER_PAGE = 6;

type Props = { lastChecked: string | null; products: number; stores: number };

/** "Checked 1m ago · Next automatic check in 3h 59m" with a Check now that re-reads everything. */
export default function CheckAllRow({ lastChecked, products, stores }: Props) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const next = useSyncExternalStore(everyMinute, untilNextCheck, () => null);

  function run() {
    setResult(null);
    setProgress(0);
    // The bar fills toward 90% over the expected time; it goes away when the check returns.
    requestAnimationFrame(() => requestAnimationFrame(() => setProgress(90)));
    startTransition(async () => {
      const r = await refreshAllProducts();
      if (r.ok) setResult(r.message ?? "Prices are up to date");
      else toast.error(r.error);
    });
  }

  const done = result !== null && !pending;
  const title = pending
    ? `Checking ${products} product${products === 1 ? "" : "s"}…`
    : done
      ? "Checked just now"
      : lastChecked
        ? `Checked ${timeAgo(lastChecked)}`
        : "Not checked yet";
  const sub = pending
    ? `Reading prices from ${stores} store${stores === 1 ? "" : "s"}`
    : done
      ? result
      : next && `Next automatic check in ${next}`;
  const expected = Math.max(2, Math.ceil(products / CONCURRENCY) * SECONDS_PER_PAGE);

  return (
    <div className="mt-4 border-t pt-3.5">
      <div className="flex items-center gap-2.5">
        {done ? (
          <CircleCheck className="size-[1.0625rem] shrink-0 text-success" />
        ) : (
          <RefreshCw className={cn("size-[1.0625rem] shrink-0 text-muted-foreground", pending && "animate-spin")} />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium" suppressHydrationWarning>
            {title}
          </p>
          <p className="min-h-4 text-xs text-muted-foreground">{sub}</p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="h-9 shrink-0 rounded-lg border bg-card px-3 text-[0.8125rem] font-medium hover:bg-muted disabled:opacity-60"
        >
          {pending ? "Checking…" : done ? "Check again" : "Check now"}
        </button>
      </div>
      {pending && (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Checking prices">
          <div
            className="h-full rounded-full bg-primary"
            // A steady fill over the expected time, not a spring: it stands for elapsed work.
            style={{ width: `${progress}%`, transition: progress === 0 ? "none" : `width ${expected}s linear` }}
          />
        </div>
      )}
    </div>
  );
}
