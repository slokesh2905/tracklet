"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, Clipboard, X } from "lucide-react";
import { toast } from "sonner";
import { addProduct, deleteProduct } from "@/app/actions/products";
import { readClipboardLinkQuietly } from "@/lib/clipboard";
import { normalizeProductUrl } from "@/lib/validation";

const DISMISSED_KEY = "tracklet:clipboard-dismissed";

function dismissedLink() {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function rememberDismissed(link: string) {
  try {
    localStorage.setItem(DISMISSED_KEY, link);
  } catch {
    /* private mode: it just shows again next time */
  }
}

const canonical = (url: string) => {
  try {
    return normalizeProductUrl(url);
  } catch {
    return url;
  }
};

type Added = { productId: string | null; undone: boolean };

/**
 * "Track the link you copied?" on Home. Only shown when the browser lets us read the clipboard
 * without a prompt, the link isn't tracked already, and it wasn't waved away before.
 */
export default function ClipboardSuggest({ trackedUrls }: { trackedUrls: string[] }) {
  const [link, setLink] = useState<string | null>(null);
  const [state, setState] = useState<"ask" | "done">("ask");
  const added = useRef<Added | null>(null);
  const tracked = useMemo(() => new Set(trackedUrls.map(canonical)), [trackedUrls]);

  useEffect(() => {
    let alive = true;
    async function check() {
      const found = await readClipboardLinkQuietly();
      if (!alive || !found) return;
      const url = canonical(found);
      if (tracked.has(url) || dismissedLink() === url) return;
      setLink((current) => current ?? url);
    }
    void check();
    // Coming back from the store app with a freshly copied link.
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tracked]);

  if (!link) return null;

  function track() {
    if (!link) return;
    const entry: Added = { productId: null, undone: false };
    added.current = entry;
    rememberDismissed(link);
    // Show the result right away: adding reads the page, which is the first price check.
    setState("done");
    void addProduct(link).then((result) => {
      if (!result.ok) {
        if (added.current === entry) setState("ask");
        toast.error(result.error);
        return;
      }
      entry.productId = result.updated ? null : result.productId;
      if (entry.undone && entry.productId) void deleteProduct(entry.productId);
    });
  }

  function undo() {
    const entry = added.current;
    added.current = null;
    setState("ask");
    if (!entry) return;
    entry.undone = true;
    // Still adding: the delete runs once the add returns (see track).
    if (entry.productId) void deleteProduct(entry.productId);
  }

  function dismiss() {
    if (link) rememberDismissed(link);
    setLink(null);
  }

  if (state === "done") {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-success/20 bg-success/8 py-2 pr-1 pl-3" role="status">
        <CircleCheck className="size-5 shrink-0 text-success" />
        <p className="min-w-0 flex-1 text-sm leading-snug">
          <b className="font-semibold">Added to Products.</b> The first price check is running.
        </p>
        <button type="button" onClick={undo} className="h-11 shrink-0 px-3 text-sm font-medium text-primary">
          Undo
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 flex items-center gap-3 rounded-xl border bg-card py-2 pr-1 pl-3 shadow-xs">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[0.625rem] bg-chart-2/15 text-chart-2">
        <Clipboard className="size-[1.0625rem]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Track the link you copied?</p>
        <p className="truncate font-mono text-xs text-muted-foreground">{link.replace(/^https?:\/\/(www\.)?/, "")}</p>
      </div>
      <button
        type="button"
        onClick={track}
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground"
      >
        Track
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="flex h-11 w-10 shrink-0 items-center justify-center text-muted-foreground"
      >
        <X className="size-[1.0625rem]" />
      </button>
    </div>
  );
}
