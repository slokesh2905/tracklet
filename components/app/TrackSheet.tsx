"use client";

import AddProductForm from "@/components/AddProductForm";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { CollectionRow } from "@/lib/db/schema";

/** The phone's "Track a product" entry point, opened from the centre tab. */
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: Pick<CollectionRow, "id" | "name">[];
};

export default function TrackSheet({ open, onOpenChange, collections }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <SheetHeader>
          <SheetTitle className="text-xl tracking-tight">Track a product</SheetTitle>
          <SheetDescription>Paste a link from Amazon, Flipkart, Best Buy or almost any store.</SheetDescription>
        </SheetHeader>
        <div className="px-4">
          <AddProductForm signedIn collections={collections} onAdded={() => onOpenChange(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
