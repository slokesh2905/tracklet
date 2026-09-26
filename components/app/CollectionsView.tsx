"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { FolderHeart, ImageOff, Loader2, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createCollection,
  deleteCollection,
  renameCollection,
  setCollectionPublic,
} from "@/app/actions/collections";
import ConfirmDialog from "@/components/ConfirmDialog";
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
import type { CollectionRow, ProductRow } from "@/lib/database.types";
import { formatPrice } from "@/lib/format";

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

function CollectionCard({ collection }: { collection: Collection }) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const count = collection.products.length;

  return (
    <article className="flex flex-col gap-4 rounded-xl border bg-card p-4">
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
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {count > 0 ? (
        <ul className="flex flex-col divide-y">
          {collection.products.slice(0, 4).map((p) => (
            <li key={p.id}>
              <Link href={`/products/${p.id}`} className="flex items-center gap-3 py-2 hover:opacity-80">
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
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete “${collection.name}”?`}
        description="The products stay tracked. They just leave this collection."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const r = await deleteCollection(collection.id);
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
        }}
      />
    </article>
  );
}

export default function CollectionsView({ collections }: { collections: Collection[] }) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Collections</h1>
          <p className="text-sm text-muted-foreground">Organise products and share wishlists.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="size-4" /> <span className="max-sm:sr-only">New collection</span>
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {collections.map((c) => (
            <CollectionCard key={c.id} collection={c} />
          ))}
        </div>
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
