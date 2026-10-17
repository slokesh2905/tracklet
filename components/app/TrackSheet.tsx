"use client";

import { useRef } from "react";
import AddProductForm from "@/components/AddProductForm";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { CollectionRow } from "@/lib/db/schema";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: Pick<CollectionRow, "id" | "name">[];
};

/** The phone's "Track a product" entry point, opened from the centre tab. */
export default function TrackSheet({ open, onOpenChange, collections }: Props) {
  const body = useRef<HTMLDivElement>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        // Round 36px close button, as in the design; the default is a small bare icon.
        closeClassName="top-[1.375rem] right-5 flex size-9 items-center justify-center rounded-full bg-foreground/[0.06] opacity-100 [&_svg]:size-[1.125rem] [&_svg]:text-muted-foreground"
        className="max-h-[92dvh] overflow-y-auto rounded-t-2xl px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        // Land in the link box, so the keyboard is up and ready to paste into, instead of on the first button.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          body.current?.querySelector<HTMLInputElement>("input[name=link]")?.focus({ preventScroll: true });
        }}
      >
        <SheetHeader className="p-0 pt-2">
          <SheetTitle className="text-xl tracking-tight">Track a product</SheetTitle>
          <SheetDescription className="sr-only">Paste a link from Amazon, Flipkart, Best Buy or almost any store.</SheetDescription>
        </SheetHeader>
        <div ref={body}>
          <AddProductForm signedIn collections={collections} onAdded={() => onOpenChange(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
