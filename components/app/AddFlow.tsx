"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronRight,
  CircleCheck,
  CircleX,
  ClipboardPaste,
  FolderHeart,
  ImageOff,
  Link2,
  Loader2,
  PackageX,
  Plus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { createCollection } from "@/app/actions/collections";
import { addProduct, previewProduct, type ProductPreview } from "@/app/actions/products";
import AlertRuleFields, { useAlertRule } from "@/components/product/AlertRuleFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CollectionRow } from "@/lib/db/schema";
import { formatDate, formatPercent, formatPrice, hostname, percentChange } from "@/lib/format";
import { cn } from "@/lib/utils";
import { productUrlSchema } from "@/lib/validation";

type Collection = Pick<CollectionRow, "id" | "name">;

type Props = {
  collections: Collection[];
  /** Read this link on arrival (a link shared into the app). */
  initialUrl?: string;
  /** Called with the tracking id once the product is being tracked. */
  onAdded?: (productId: string) => void;
  onAddingChange?: (adding: boolean) => void;
};

/** Wait this long after the last keystroke before reading a link, so typing doesn't read half-links. */
const TYPING_DELAY_MS = 600;

type Read = { source: string; preview: ProductPreview } | { source: string; error: string };

const chipClass = "h-10 shrink-0 rounded-full border px-3.5 text-[0.8125rem] font-medium whitespace-nowrap";
const chipOn = "border-primary bg-primary/10 text-primary";
const chipOff = "bg-card text-foreground/80 hover:bg-accent";

/**
 * Paste a link and the product appears as soon as it has been read; then choose an alert and a
 * collection and track it, all in one place. Reading happens once, here; tracking attaches to the
 * stored reading, so the price shown is the price you get.
 */
export default function AddFlow({ collections, initialUrl, onAdded, onAddingChange }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const latestRead = useRef(0);
  const [url, setUrl] = useState(initialUrl ?? "");
  const [reading, setReading] = useState(false);
  const [read, setRead] = useState<Read | null>(null);
  const [busy, setBusy] = useState(false);
  const [alertChoice, setAlertChoice] = useState<"any" | "5" | "10" | "custom">("any");
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [created, setCreated] = useState<Collection[]>([]);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState("");

  const trimmed = url.trim();
  const validUrl = productUrlSchema.safeParse(trimmed).success;
  // What was read only counts while the box still holds the link it was read from.
  const current = read && read.source === trimmed ? read : null;
  const preview = current && "preview" in current ? current.preview : null;
  const error = current && "error" in current ? current.error : null;

  const price = preview?.price ?? 0;
  const rule = useAlertRule({ currentPrice: price || 1 });
  const all = [...collections, ...created.filter((c) => !collections.some((k) => k.id === c.id))];
  const chosen = all.find((c) => c.id === collectionId);

  // Only the newest read counts; an older one that lands late is dropped.
  const load = useCallback((source: string) => {
    const id = ++latestRead.current;
    setReading(true);
    void previewProduct(source).then((result) => {
      if (id !== latestRead.current) return;
      setReading(false);
      setRead(result.ok ? { source, preview: result.preview } : { source, error: result.error });
      // The keyboard has done its job: put it away so the product and the button are in view.
      if (result.ok && window.matchMedia("(pointer: coarse)").matches) inputRef.current?.blur();
    });
  }, []);

  // Read a valid link shortly after it stops changing. State is only set inside the timer.
  useEffect(() => {
    if (!validUrl || (read && read.source === trimmed)) return;
    const timer = setTimeout(() => load(trimmed), trimmed === initialUrl ? 0 : TYPING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [trimmed, validUrl, read, initialUrl, load]);

  function chooseAlert(choice: typeof alertChoice) {
    setAlertChoice(choice);
    if (choice === "any") rule.clear();
    else if (choice === "custom") rule.changeMode("price");
    else {
      rule.setPct("");
      rule.setTarget(String(Math.floor(price * (1 - Number(choice) / 100))));
    }
  }

  async function paste() {
    try {
      setUrl((await navigator.clipboard.readText()).trim());
      inputRef.current?.focus();
    } catch {
      toast.error("Couldn't read the clipboard. Paste into the box instead.");
    }
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
    setPicking(false);
    router.refresh();
  }

  async function track() {
    if (!preview) return;
    setBusy(true);
    onAddingChange?.(true);
    const withRule = alertChoice !== "any";
    const result = await addProduct(trimmed, {
      collectionId,
      targetPrice: withRule ? rule.target : null,
      alertPct: withRule ? rule.pct : null,
    });
    onAddingChange?.(false);
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    toast.success(result.message);
    onAdded?.(result.productId);
  }

  const discount =
    preview?.originalPrice && preview.originalPrice > preview.price ? percentChange(preview.originalPrice, preview.price) : null;
  const dropChips: Array<{ key: typeof alertChoice; label: string }> = preview
    ? [
        { key: "any", label: "Any drop" },
        ...(["5", "10"] as const).map((n) => ({
          key: n,
          label: `−${n}% · ${formatPrice(Math.floor(preview.price * (1 - Number(n) / 100)), preview.currency)}`,
        })),
        { key: "custom", label: "Custom…" },
      ]
    : [];

  return (
    <div className="flex flex-col gap-3.5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // Enter reads right away (and retries a failed read) instead of waiting out the typing delay.
          if (validUrl && !preview && !reading) load(trimmed);
        }}
        className="flex h-12 items-center gap-2.5 rounded-lg border border-input bg-background pr-1 pl-3 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
      >
        <Link2 className="size-[1.125rem] shrink-0 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="url"
          name="link"
          inputMode="url"
          enterKeyHint="go"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a product link from any store"
          aria-label="Product URL"
          aria-invalid={Boolean(error)}
          className="h-full min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        {reading ? (
          <span className="flex size-9 items-center justify-center" aria-label="Reading page">
            <Loader2 className="size-[1.125rem] animate-spin text-muted-foreground" />
          </span>
        ) : trimmed ? (
          <button
            type="button"
            aria-label="Clear link"
            onClick={() => {
              setUrl("");
              inputRef.current?.focus();
            }}
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground"
          >
            <CircleX className="size-[1.125rem]" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void paste()}
            className="flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-primary"
          >
            <ClipboardPaste className="size-4" /> Paste
          </button>
        )}
      </form>

      {trimmed && !validUrl && <p className="-mt-1.5 text-xs text-muted-foreground">Paste a full link that starts with https://</p>}
      {error && (
        <p role="alert" className="-mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}

      {reading && !preview && (
        <div className="flex gap-3 rounded-2xl border bg-card p-3" aria-hidden>
          <div className="size-14 shrink-0 animate-pulse rounded-xl bg-muted" />
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-3.5 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
      )}

      {preview && (
        <>
          <div className="flex flex-col gap-2.5 rounded-2xl border bg-card p-3">
            <div className="flex gap-3">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white">
                {preview.imageUrl ? (
                  // Retailer images come from arbitrary hosts; plain img avoids optimiser allow-lists.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.imageUrl} alt="" className="size-full object-contain p-1" />
                ) : (
                  <ImageOff className="size-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-xs font-medium text-success">
                  <CircleCheck className="size-[0.8125rem]" /> Found on {hostname(trimmed)}
                </p>
                <p className="mt-0.5 line-clamp-2 text-sm leading-snug font-medium">{preview.name}</p>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                  <span className="text-[1.0625rem] font-bold tabular-nums">{formatPrice(preview.price, preview.currency)}</span>
                  {discount !== null && (
                    <span className="text-xs font-medium text-success">{formatPercent(discount, { signed: true })} off list</span>
                  )}
                  {!preview.inStock && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-danger">
                      <PackageX className="size-3" /> Out of stock
                    </span>
                  )}
                </p>
              </div>
            </div>
            {preview.otherShoppers > 0 && preview.historySince && (
              <p className="flex items-center gap-2 border-t pt-2.5 text-xs leading-snug text-muted-foreground" suppressHydrationWarning>
                <Users className="size-3.5 shrink-0" />
                {preview.otherShoppers === 1 ? "Another shopper already tracks" : `${preview.otherShoppers} other shoppers already track`}{" "}
                this, so you get its price history back to {formatDate(preview.historySince)}.
              </p>
            )}
          </div>

          {preview.trackedProductId ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-chart-2/25 bg-chart-2/10 p-3.5">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Check className="size-4 text-chart-2" /> You&apos;re already tracking this
              </p>
              <Button asChild className="h-11">
                <Link href={`/products/${preview.trackedProductId}`} onClick={() => onAdded?.(preview.trackedProductId!)}>
                  Open it <ChevronRight className="size-4" />
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <span className="text-[0.8125rem] font-semibold">Alert me when it drops</span>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Alert me when it drops">
                  {dropChips.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      role="radio"
                      aria-checked={alertChoice === c.key}
                      onClick={() => chooseAlert(c.key)}
                      className={cn(chipClass, alertChoice === c.key ? chipOn : chipOff)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                {alertChoice === "custom" && (
                  <div className="mt-1.5 flex flex-col gap-5 rounded-2xl border bg-card p-3.5">
                    <AlertRuleFields idPrefix="add-flow" currency={preview.currency} currentPrice={preview.price} rule={rule} />
                  </div>
                )}
              </div>

              <div className="rounded-lg border bg-background">
                <button
                  type="button"
                  onClick={() => setPicking(!picking)}
                  aria-expanded={picking}
                  className="flex h-11 w-full items-center gap-2.5 pr-2.5 pl-3 text-left"
                >
                  <FolderHeart className="size-[1.0625rem] text-muted-foreground" />
                  <span className="flex-1 text-[0.9375rem]">Collection</span>
                  <span className="max-w-[40%] truncate text-[0.9375rem] text-muted-foreground">{chosen?.name ?? "None"}</span>
                  <ChevronRight className={cn("size-4 text-muted-foreground", picking && "rotate-90")} />
                </button>
                {picking && (
                  <div className="flex flex-col gap-2.5 border-t p-3">
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Collection">
                      {[{ id: null, name: "None" }, ...all].map((c) => (
                        <button
                          key={c.id ?? "none"}
                          type="button"
                          role="radio"
                          aria-checked={collectionId === c.id}
                          onClick={() => {
                            setCollectionId(c.id);
                            setPicking(false);
                          }}
                          className={cn(chipClass, collectionId === c.id ? chipOn : chipOff)}
                        >
                          {c.name}
                        </button>
                      ))}
                      {!naming && (
                        <button type="button" onClick={() => setNaming(true)} className={cn(chipClass, "border-dashed", chipOff)}>
                          <Plus className="mr-1 inline size-3.5" />
                          New
                        </button>
                      )}
                    </div>
                    {naming && (
                      <div className="flex gap-2">
                        <Input
                          autoFocus
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void makeCollection();
                            }
                          }}
                          placeholder="Collection name"
                          aria-label="New collection name"
                          maxLength={60}
                          enterKeyHint="done"
                          className="bg-background"
                        />
                        <Button type="button" variant="outline" disabled={busy || !newName.trim()} onClick={() => void makeCollection()}>
                          Create
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {!preview?.trackedProductId && (
        <Button type="button" className="h-12 gap-2 text-base md:self-end md:px-6" disabled={!preview || busy} onClick={() => void track()}>
          {busy ? <Loader2 className="size-[1.125rem] animate-spin" /> : <Plus className="size-[1.125rem]" />}
          Track price
        </Button>
      )}
    </div>
  );
}
