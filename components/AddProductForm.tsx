"use client";

import { useState } from "react";
import { ListPlus, Link2, Loader2, Plus } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { bulkUrlsSchema, firstIssue } from "@/lib/validation";

type Props = {
  signedIn: boolean;
  /** Offered in the signed-in flow so a product can be filed as it is added. */
  collections?: Pick<CollectionRow, "id" | "name">[];
  collectionId?: string | null;
  onAddingChange?: (adding: boolean) => void;
  /** Called once at least one product was added, so a hosting sheet can close. */
  onAdded?: () => void;
  size?: "hero" | "default";
};

export default function AddProductForm({ signedIn, collections = [], collectionId, onAddingChange, onAdded, size = "default" }: Props) {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [url, setUrl] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
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

  return (
    <div className="w-full">
      {mode === "single" ? (
        signedIn ? (
          <AddFlow collections={collections} onAdded={() => onAdded?.()} onAddingChange={onAddingChange} onPreviewingChange={setPreviewing} />
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
                autoComplete="off"
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
        <form onSubmit={submitBulk} className="flex flex-col gap-2">
          <Textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={"One link per line (up to 20)\nhttps://…\nhttps://…"}
            aria-label="Product URLs, one per line"
            className="min-h-28 bg-background font-mono text-sm md:text-sm"
            disabled={loading}
          />
          {progress && (
            <div className="flex flex-col gap-1.5" aria-live="polite">
              <Progress value={(progress.done / progress.total) * 100} />
              <p className="text-xs text-muted-foreground">
                {progress.done + 1} of {progress.total} · reading {progress.current}…
              </p>
            </div>
          )}
          <Button type="submit" disabled={loading} className="gap-2 sm:self-end">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <ListPlus className="size-4" />}
            Track all
          </Button>
        </form>
      )}

      {signedIn && !previewing && (
        <button
          type="button"
          onClick={() => setMode(mode === "single" ? "bulk" : "single")}
          disabled={loading}
          className="mt-2 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline pointer-coarse:py-2"
        >
          {mode === "single" ? "Add several links at once" : "Add a single link"}
        </button>
      )}

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  );
}
