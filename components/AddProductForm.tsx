"use client";

import { useState } from "react";
import { CircleCheck, CircleX, Link2, ListPlus, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { addProduct } from "@/app/actions/products";
import AddFlow from "@/components/app/AddFlow";
import AuthModal from "@/components/AuthModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import type { CollectionRow } from "@/lib/db/schema";
import { hostname } from "@/lib/format";
import { isShortLink } from "@/lib/product-key";
import { cn } from "@/lib/utils";
import { bulkUrlsSchema, firstIssue, productUrlSchema } from "@/lib/validation";

type Props = {
  signedIn: boolean;
  /** Offered in the signed-in flow so a product can be filed as it is added. */
  collections?: Pick<CollectionRow, "id" | "name">[];
  collectionId?: string | null;
  onAddingChange?: (adding: boolean) => void;
  /** Called once at least one product was added, so a hosting sheet can close. */
  onAdded?: () => void;
  /** Start with the copied link in the box, when the browser allows reading it without asking. */
  fromClipboard?: boolean;
  size?: "hero" | "default";
};

/** Each pasted line, checked the way adding will check it, so problems show before anything is read. */
function checkLines(text: string) {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => {
      const parsed = productUrlSchema.safeParse(line);
      return parsed.success
        ? { line, ok: true as const, host: hostname(parsed.data), note: isShortLink(parsed.data) ? "share link, resolved on add" : "product link" }
        : { line, ok: false as const, host: line.length > 28 ? `${line.slice(0, 28)}…` : line, note: "not a valid link" };
    });
}

export default function AddProductForm({ signedIn, collections = [], collectionId, onAddingChange, onAdded, fromClipboard = false, size = "default" }: Props) {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [url, setUrl] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  function begin() {
    setLoading(true);
    onAddingChange?.(true);
  }
  function finish() {
    setLoading(false);
    setProgress(null);
    onAddingChange?.(false);
  }

  async function submitBulk(e: React.FormEvent) {
    e.preventDefault();
    if (!signedIn) return setAuthOpen(true);
    const parsed = bulkUrlsSchema.safeParse(bulkText);
    if (!parsed.success) return toast.error(firstIssue(parsed.error));

    const urls = parsed.data;
    begin();
    const failed: string[] = [];
    for (const [i, u] of urls.entries()) {
      setProgress({ done: i, total: urls.length, current: hostname(u) });
      const result = await addProduct(u, { collectionId });
      if (!result.ok) failed.push(u);
    }
    finish();

    const added = urls.length - failed.length;
    if (added > 0) {
      toast.success(`Tracking ${added} product${added === 1 ? "" : "s"}`);
      onAdded?.();
    }
    if (failed.length > 0) {
      toast.error(`${failed.length} couldn't be read`, { description: failed.map(hostname).join(", ") });
      setBulkText(failed.join("\n"));
    } else {
      setBulkText("");
      setMode("single");
    }
  }

  const hero = size === "hero";
  const lines = checkLines(bulkText);
  const readable = lines.filter((l) => l.ok).length;

  return (
    <div className="w-full">
      {signedIn && (
        <div role="tablist" aria-label="How many links" className="mb-4 grid grid-cols-2 rounded-xl bg-foreground/[0.06] p-[3px]">
          {(
            [
              ["single", "One link"],
              ["bulk", "Several links"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              disabled={loading}
              onClick={() => setMode(value)}
              className={cn(
                "h-9 rounded-[0.5625rem] text-sm font-medium",
                mode === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {mode === "single" ? (
        signedIn ? (
          <AddFlow collections={collections} fromClipboard={fromClipboard} onAdded={() => onAdded?.()} onAddingChange={onAddingChange} />
        ) : (
          // Signed out there is nothing to preview: asking to sign in is the whole flow.
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAuthOpen(true);
            }}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="url"
                inputMode="url"
                enterKeyHint="go"
                autoComplete="off"
                autoCapitalize="none"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste a product link from any store"
                aria-label="Product URL"
                className={cn("pl-9 bg-background", hero && "h-12 pointer-coarse:h-12 text-base md:text-base")}
                required
              />
            </div>
            <Button type="submit" size={hero ? "lg" : "default"} className={cn("gap-2", hero && "h-12 px-6")}>
              <Plus className="size-4" /> Track price
            </Button>
          </form>
        )
      ) : (
        <form onSubmit={submitBulk} className="flex flex-col gap-3.5">
          <Textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={"One link per line (up to 20)\nhttps://…\nhttps://…"}
            aria-label="Product URLs, one per line"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            // 16px: anything smaller makes iOS zoom the page when the box is focused.
            className="min-h-28 bg-background font-mono text-base leading-relaxed md:text-sm"
            disabled={loading}
          />
          {lines.length > 0 && (
            <ul className="flex flex-col gap-2.5 text-[0.8125rem]">
              {lines.slice(0, 20).map((l, i) => (
                <li key={`${l.line}-${i}`} className="flex items-center gap-2">
                  {l.ok ? (
                    <CircleCheck className="size-[0.9375rem] shrink-0 text-success" />
                  ) : (
                    <CircleX className="size-[0.9375rem] shrink-0 text-danger" />
                  )}
                  <span className="truncate font-medium">{l.host}</span>
                  <span className="truncate text-muted-foreground">{l.note}</span>
                </li>
              ))}
              {lines.length > 20 && <li className="text-danger">Only the first 20 links are added.</li>}
            </ul>
          )}
          {progress && (
            <div className="flex flex-col gap-1.5" aria-live="polite">
              <Progress value={(progress.done / progress.total) * 100} />
              <p className="text-xs text-muted-foreground">
                {progress.done + 1} of {progress.total} · reading {progress.current}…
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Up to 20 links, one per line. Links that can&apos;t be read stay in the box so you can fix them.</p>
          <Button type="submit" disabled={loading || readable === 0} className="h-12 gap-2 text-base md:self-end md:px-6">
            {loading ? <Loader2 className="size-[1.125rem] animate-spin" /> : <ListPlus className="size-[1.125rem]" />}
            {readable > 1 ? `Track ${readable} products` : "Track product"}
          </Button>
        </form>
      )}

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  );
}
