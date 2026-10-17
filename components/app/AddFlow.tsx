"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, Check, ChevronRight, ImageOff, Link2, Loader2, PackageX, Plus } from "lucide-react";
import { toast } from "sonner";
import { createCollection } from "@/app/actions/collections";
import { addProduct, previewProduct, type ProductPreview } from "@/app/actions/products";
import AlertRuleFields, { useAlertRule } from "@/components/product/AlertRuleFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CollectionRow } from "@/lib/db/schema";
import { formatPercent, formatPrice, hostname, percentChange } from "@/lib/format";
import { cn } from "@/lib/utils";

type Collection = Pick<CollectionRow, "id" | "name">;

type Props = {
  collections: Collection[];
  /** Read this link on arrival (a link shared into the app). */
  initialUrl?: string;
  /** Called with the tracking id once the product is being tracked. */
  onAdded?: (productId: string) => void;
  onAddingChange?: (adding: boolean) => void;
  /** Lets a host hide its own controls while a product is being previewed. */
  onPreviewingChange?: (previewing: boolean) => void;
};

const chip =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium pointer-coarse:h-10 pointer-coarse:px-3.5";

function PreviewStep({
  url,
  preview,
  collections,
  onBack,
  onAdded,
  onAddingChange,
}: { url: string; preview: ProductPreview; onBack: () => void } & Pick<Props, "collections" | "onAdded" | "onAddingChange">) {
  const router = useRouter();
  const rule = useAlertRule({ currentPrice: preview.price });
  const [alertOpen, setAlertOpen] = useState(false);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [created, setCreated] = useState<Collection[]>([]);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const all = [...collections, ...created.filter((c) => !collections.some((k) => k.id === c.id))];
  const discount = preview.originalPrice && preview.originalPrice > preview.price ? percentChange(preview.originalPrice, preview.price) : null;

  function toggleAlert() {
    if (alertOpen) rule.clear();
    // Opening seeds a sensible starting target, as the stepper would otherwise show a value that isn't saved.
    else rule.changeMode("price");
    setAlertOpen(!alertOpen);
  }

  async function makeCollection() {
    if (!newName.trim()) return;
    setBusy(true);
    const result = await createCollection(newName);
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    setCreated((c) => [...c, { id: result.id, name: newName.trim() }]);
    setCollectionId(result.id);
    setNaming(false);
    setNewName("");
    router.refresh();
  }

  async function track() {
    setBusy(true);
    onAddingChange?.(true);
    const result = await addProduct(url, {
      collectionId,
      targetPrice: alertOpen ? rule.target : null,
      alertPct: alertOpen ? rule.pct : null,
    });
    onAddingChange?.(false);
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    toast.success(result.message);
    onAdded?.(result.productId);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 rounded-2xl border bg-card p-3">
        <div className="flex size-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white">
          {preview.imageUrl ? (
            // Retailer images come from arbitrary hosts; plain img avoids optimiser allow-lists.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.imageUrl} alt="" className="size-full object-contain p-1" />
          ) : (
            <ImageOff className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{hostname(url)}</p>
          <p className="mt-0.5 line-clamp-2 text-[0.9375rem] leading-snug font-semibold text-pretty">{preview.name}</p>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
            <span className="text-xl font-bold tracking-tight tabular-nums">{formatPrice(preview.price, preview.currency)}</span>
            {discount !== null && (
              <span className="text-xs text-muted-foreground">
                <s>{formatPrice(preview.originalPrice!, preview.currency)}</s> {formatPercent(discount, { signed: true })}
              </span>
            )}
          </p>
          {!preview.inStock && (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-danger/12 px-2 py-0.5 text-xs font-medium text-danger">
              <PackageX className="size-3" /> Out of stock
            </span>
          )}
        </div>
      </div>

      {preview.trackedProductId ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-chart-2/25 bg-chart-2/10 p-3.5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Check className="size-4 text-chart-2" /> You&apos;re already tracking this
          </p>
          <div className="flex gap-2">
            <Button asChild className="h-11 flex-1">
              <Link href={`/products/${preview.trackedProductId}`} onClick={() => onAdded?.(preview.trackedProductId!)}>
                Open <ChevronRight className="size-4" />
              </Link>
            </Button>
            <Button type="button" variant="outline" className="h-11" onClick={onBack}>
              Another link
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border bg-card">
            <button
              type="button"
              onClick={toggleAlert}
              aria-expanded={alertOpen}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
            >
              <span className="flex size-[2.125rem] shrink-0 items-center justify-center rounded-[0.625rem] bg-primary/12 text-primary">
                <BellRing className="size-[1.0625rem]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-medium">Set a price alert</span>
                <span className="block text-xs text-muted-foreground">
                  {alertOpen ? "Remove it to be told about every drop" : "Optional. Otherwise we tell you about every drop"}
                </span>
              </span>
              <span className="text-sm font-medium text-primary">{alertOpen ? "Remove" : "Add"}</span>
            </button>
            {alertOpen && (
              <div className="flex flex-col gap-5 border-t p-3.5">
                <AlertRuleFields idPrefix="add-flow" currency={preview.currency} currentPrice={preview.price} rule={rule} />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[0.8125rem] font-semibold text-muted-foreground">Collection</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Collection">
              {[{ id: null, name: "None" }, ...all].map((c) => {
                const active = collectionId === c.id;
                return (
                  <button
                    key={c.id ?? "none"}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setCollectionId(c.id)}
                    className={cn(chip, active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground")}
                  >
                    {c.name}
                  </button>
                );
              })}
              {!naming && (
                <button type="button" onClick={() => setNaming(true)} className={cn(chip, "border-dashed bg-card text-muted-foreground hover:bg-accent hover:text-foreground")}>
                  <Plus className="size-3.5" /> New
                </button>
              )}
            </div>
            {naming && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void makeCollection();
                }}
                className="flex gap-2"
              >
                <Input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Collection name"
                  aria-label="New collection name"
                  maxLength={60}
                  className="bg-background"
                />
                <Button type="submit" variant="outline" disabled={busy || !newName.trim()}>
                  Create
                </Button>
              </form>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-12" onClick={onBack} disabled={busy}>
              Back
            </Button>
            <Button type="button" className="h-12 flex-1 gap-2 text-base" onClick={() => void track()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Start tracking
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Paste a link, check it's the right product, then choose an alert and a collection in one go.
 * Reading the page happens once, in the preview; tracking attaches to that stored reading.
 */
export default function AddFlow({ collections, initialUrl, onAdded, onAddingChange, onPreviewingChange }: Props) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [reading, setReading] = useState(Boolean(initialUrl));
  const [preview, setPreview] = useState<{ url: string; data: ProductPreview } | null>(null);

  function showPreview(next: { url: string; data: ProductPreview } | null) {
    setPreview(next);
    onPreviewingChange?.(next !== null);
  }

  async function read(target: string) {
    setReading(true);
    const result = await previewProduct(target);
    setReading(false);
    if (result.ok) showPreview({ url: target, data: result.preview });
    else toast.error(result.error);
  }

  // State is only set once the read resolves; `cancelled` drops the result of an abandoned effect run.
  useEffect(() => {
    if (!initialUrl) return;
    let cancelled = false;
    void previewProduct(initialUrl).then((result) => {
      if (cancelled) return;
      setReading(false);
      if (result.ok) setPreview({ url: initialUrl, data: result.preview });
      else toast.error(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [initialUrl]);

  if (preview) {
    return (
      <PreviewStep
        url={preview.url}
        preview={preview.data}
        collections={collections}
        onAdded={onAdded}
        onAddingChange={onAddingChange}
        onBack={() => {
          showPreview(null);
          setUrl("");
        }}
      />
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void read(url);
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
          className="bg-background pl-9"
          required
          disabled={reading}
        />
      </div>
      <Button type="submit" disabled={reading} className="gap-2">
        {reading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {reading ? "Reading page…" : "Find product"}
      </Button>
    </form>
  );
}
