"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { FolderHeart, FolderPlus, Globe, ImageOff, Loader2, Lock, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createCollection,
  deleteCollection,
  renameCollection,
  setCollectionPublic,
} from "@/app/actions/collections";
import ShareControl from "@/components/ShareControl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { CollectionRow, ProductRow } from "@/lib/db/schema";
import { formatPrice } from "@/lib/format";
import { deleteWithUndo } from "@/lib/undo";

type Collection = CollectionRow & {
  products: Array<Pick<ProductRow, "id" | "name" | "image_url" | "current_price" | "currency">>;
};

function NameDialog({
  open,
  onOpenChange,
  title,
  initial = "",
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial?: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(initial);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Group products into wishlists you can share, like “Birthday ideas”.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              if (await onSubmit(name)) onOpenChange(false);
            });
          }}
          className="flex flex-col gap-4"
        >
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Collection name" maxLength={60} aria-label="Collection name" />
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CollectionCard({
  collection,
  onRemovedChange,
}: {
  collection: Collection;
  /** Lets a hosting tile hide itself along with the card. */
  onRemovedChange?: (removed: boolean) => void;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [removed, setRemoved] = useState(false);
  const count = collection.products.length;

  function deleteCollectionWithUndo() {
    setRemoved(true);
    onRemovedChange?.(true);
    deleteWithUndo({
      message: "Collection deleted (products kept)",
      commit: () => deleteCollection(collection.id),
      restore: () => {
        setRemoved(false);
        onRemovedChange?.(false);
      },
    });
  }

  return (
    <article hidden={removed} className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{collection.name}</h2>
          <p className="text-xs text-muted-foreground">
            {count} product{count === 1 ? "" : "s"}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Collection actions">
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
              <Pencil /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={deleteCollectionWithUndo}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {count > 0 ? (
        <ul className="flex flex-col divide-y">
          {collection.products.slice(0, 4).map((p) => (
            <li key={p.id}>
              <Link href={`/products/${p.id}`} data-press="highlight" className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/50">
                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt="" loading="lazy" className="size-full object-contain p-0.5" />
                  ) : (
                    <ImageOff className="size-4 text-muted-foreground" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                <span className="shrink-0 text-sm font-medium tabular-nums">{formatPrice(Number(p.current_price), p.currency)}</span>
              </Link>
            </li>
          ))}
          {count > 4 && <li className="pt-2 text-xs text-muted-foreground">+{count - 4} more</li>}
        </ul>
      ) : (
        <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          Empty. Use a product’s ⋮ menu on the dashboard to add it here.
        </p>
      )}

      <ShareControl
        isPublic={collection.is_public}
        path={`/c/${collection.share_slug}`}
        label={collection.name}
        onToggle={(next) => setCollectionPublic(collection.id, next)}
      />

      <NameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename collection"
        initial={collection.name}
        submitLabel="Save"
        onSubmit={async (name) => {
          const r = await renameCollection(collection.id, name);
          if (!r.ok) toast.error(r.error);
          return r.ok;
        }}
      />
    </article>
  );
}

/** A phone shows each collection as a tile; tapping it opens the full card (products, sharing) in a sheet. */
function CollectionTile({ collection }: { collection: Collection }) {
  const [open, setOpen] = useState(false);
  const [removed, setRemoved] = useState(false);
  const count = collection.products.length;
  const covers = collection.products.slice(0, 2);
  const currencies = new Set(collection.products.map((p) => p.currency));
  // A total only makes sense when everything is priced in the same currency.
  const total =
    currencies.size === 1 && count > 0
      ? formatPrice(
          collection.products.reduce((sum, p) => sum + Number(p.current_price), 0),
          collection.products[0]!.currency
        )
      : null;

  return (
    <>
      <button
        type="button"
        hidden={removed}
        onClick={() => setOpen(true)}
        className="flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-xs"
      >
        <span className="grid h-28 w-full grid-cols-2 gap-px bg-border">
          {covers.length === 0 ? (
            <span className="col-span-2 flex items-center justify-center bg-card">
              <FolderHeart className="size-7 text-muted-foreground" />
            </span>
          ) : (
            covers.map((p) => (
              <span key={p.id} className="flex items-center justify-center bg-card p-2.5">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt="" loading="lazy" className="size-full rounded-lg object-contain" />
                ) : (
                  <ImageOff className="size-4 text-muted-foreground" />
                )}
              </span>
            ))
          )}
        </span>
        <span className="flex flex-col gap-0.5 px-3 pt-2.5 pb-3">
          <span className="truncate text-[0.9375rem] font-semibold">{collection.name}</span>
          <span className="text-xs text-muted-foreground">
            {count} product{count === 1 ? "" : "s"}
            {total && ` · ${total}`}
          </span>
          <span className="mt-2 flex">
            {collection.is_public ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-chart-2/15 px-2 py-0.5 text-xs font-medium text-chart-2">
                <Globe className="size-[0.6875rem]" /> Shared
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <Lock className="size-[0.6875rem]" /> Private
              </span>
            )}
          </span>
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="max-h-[88dvh] overflow-y-auto rounded-t-2xl p-4 pt-7 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <SheetHeader className="sr-only">
            <SheetTitle>{collection.name}</SheetTitle>
          </SheetHeader>
          <CollectionCard
            collection={collection}
            onRemovedChange={(r) => {
              setRemoved(r);
              if (r) setOpen(false);
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

export default function CollectionsView({ collections }: { collections: Collection[] }) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight md:text-2xl">Collections</h1>
          <p className="text-sm text-muted-foreground">Group products into wishlists and share them.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2 max-md:h-10 max-md:rounded-full max-md:bg-primary/12 max-md:text-primary max-md:hover:bg-primary/20">
          <Plus className="size-4" /> <span className="md:hidden">New</span>
          <span className="max-md:hidden">New collection</span>
        </Button>
      </div>

      {collections.length === 0 ? (
        <section className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
          <FolderHeart className="size-12 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">No collections yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Create one for a trip, a room makeover or a gift list, then share it with a link.
          </p>
          <Button className="mt-4 gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New collection
          </Button>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:hidden">
            {collections.map((c) => (
              <CollectionTile key={c.id} collection={c} />
            ))}
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed text-muted-foreground"
            >
              <span className="flex size-11 items-center justify-center rounded-full border bg-card">
                <FolderPlus className="size-5 text-primary" />
              </span>
              <span className="text-sm font-medium text-foreground">New collection</span>
            </button>
          </div>
          <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-3">
            {collections.map((c) => (
              <CollectionCard key={c.id} collection={c} />
            ))}
          </div>
        </>
      )}

      <NameDialog
        key={String(createOpen)}
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New collection"
        submitLabel="Create"
        onSubmit={async (name) => {
          const r = await createCollection(name);
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
          return r.ok;
        }}
      />
    </div>
  );
}
