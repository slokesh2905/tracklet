"use client";

import Link from "next/link";
import { Check, FolderHeart, FolderX } from "lucide-react";
import { SHEET_CLOSE } from "@/components/product/AlertSheet";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { CollectionRow } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: Pick<CollectionRow, "id" | "name">[];
  /** The product's collection, or null for none. */
  value: string | null;
  onChange: (collectionId: string | null) => void;
};

/** The phone's collection picker: one tap moves the product and closes. */
export default function CollectionSheet({ open, onOpenChange, collections, value, onChange }: Props) {
  const options = [{ id: null, name: "Not in a collection" }, ...collections];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        closeClassName={SHEET_CLOSE}
        className="max-h-[80dvh] gap-3.5 overflow-y-auto rounded-t-2xl px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="p-0 pt-2">
          <SheetTitle className="text-xl tracking-tight">Collection</SheetTitle>
          <SheetDescription className="sr-only">Choose which collection this product belongs to.</SheetDescription>
        </SheetHeader>

        <ul className="overflow-hidden rounded-xl border bg-card">
          {options.map((c, i) => {
            const selected = c.id === value;
            const Icon = c.id ? FolderHeart : FolderX;
            return (
              <li key={c.id ?? "none"} className={cn(i > 0 && "border-t")}>
                <button
                  type="button"
                  onClick={() => {
                    if (!selected) onChange(c.id);
                    onOpenChange(false);
                  }}
                  className="flex h-12 w-full items-center gap-3 px-3.5 text-left text-[0.9375rem]"
                  aria-pressed={selected}
                >
                  <Icon className="size-[1.0625rem] shrink-0 text-muted-foreground" />
                  <span className={cn("min-w-0 flex-1 truncate", selected && "font-medium")}>{c.name}</span>
                  {selected && <Check className="size-[1.125rem] shrink-0 text-primary" />}
                </button>
              </li>
            );
          })}
        </ul>
        {collections.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No collections yet.{" "}
            <Link href="/collections" className="font-medium text-primary">
              Create one
            </Link>{" "}
            to group products into wishlists.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
