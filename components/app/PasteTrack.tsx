"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CircleCheck, Link2, Plus } from "lucide-react";
import { UNDO_WINDOW_MS } from "@/lib/undo";
import { useQuickTrack } from "@/lib/use-quick-track";
import { cn } from "@/lib/utils";
import { productUrlSchema } from "@/lib/validation";

const noop = () => () => {};
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Desktop Home's paste box: people paste with ⌘V there, so it replaces the clipboard prompt. */
export default function PasteTrack({ className }: { className?: string }) {
  const [link, setLink] = useState("");
  const [error, setError] = useState(false);
  const sent = useRef("");
  // A link that couldn't be added goes back in the box to fix or retry.
  const quick = useQuickTrack({ onFailed: () => setLink(sent.current) });
  const mac = useSyncExternalStore(noop, isMac, () => true);
  const { added, reset } = quick;

  // Once Undo has had its moment, the box comes back for the next link.
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(reset, UNDO_WINDOW_MS + 2000);
    return () => clearTimeout(timer);
  }, [added, reset]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = productUrlSchema.safeParse(link);
    if (!parsed.success) return setError(true);
    sent.current = link;
    quick.track(parsed.data);
    setLink("");
  }

  if (quick.added) {
    return (
      <div
        role="status"
        className={cn("flex w-[27.5rem] max-w-full items-center gap-2.5 rounded-[0.625rem] border border-success/20 bg-success/8 py-1.5 pr-1.5 pl-3", className)}
      >
        <CircleCheck className="size-[1.125rem] shrink-0 text-success" />
        <p className="min-w-0 flex-1 text-sm">
          <b className="font-semibold">Added to Products.</b> The first price check is running.
        </p>
        <button type="button" onClick={quick.undo} className="h-8 shrink-0 rounded-md px-2.5 text-sm font-medium text-primary hover:bg-primary/8">
          Undo
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={cn("flex w-[27.5rem] max-w-full flex-col gap-1.5", className)} noValidate>
      <div className="flex gap-2">
        <label
          className={cn(
            "flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card px-3 shadow-xs focus-within:ring-[3px] focus-within:ring-ring/50",
            error ? "border-danger" : "focus-within:border-ring"
          )}
        >
          <Link2 className="size-4 shrink-0 text-muted-foreground" />
          <input
            name="link"
            type="url"
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setError(false);
            }}
            placeholder="Paste a product link to track"
            aria-label="Product link"
            aria-invalid={error}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="shrink-0 rounded-[0.3125rem] border px-1.5 py-0.5 font-sans text-[0.6875rem] font-medium text-muted-foreground">
            {mac ? "⌘V" : "Ctrl V"}
          </kbd>
        </label>
        <button
          type="submit"
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" /> Track
        </button>
      </div>
      {error && <p className="text-xs text-danger">Paste a product link from a store first.</p>}
    </form>
  );
}
