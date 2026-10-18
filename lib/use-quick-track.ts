"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { addProduct, deleteProduct } from "@/app/actions/products";

type Added = { productId: string | null; undone: boolean };

/**
 * Track a link in one tap, with Undo. The result shows right away: adding reads the page, which
 * is the first price check, so "running" is true while it happens. Undo during the add deletes
 * the product once the add returns; a link that was already tracked is left alone.
 */
export function useQuickTrack({ onFailed }: { onFailed?: () => void } = {}) {
  const [added, setAdded] = useState(false);
  const current = useRef<Added | null>(null);

  function track(link: string) {
    const entry: Added = { productId: null, undone: false };
    current.current = entry;
    setAdded(true);
    void addProduct(link).then((result) => {
      if (!result.ok) {
        if (current.current === entry) {
          current.current = null;
          setAdded(false);
          onFailed?.();
        }
        toast.error(result.error);
        return;
      }
      entry.productId = result.updated ? null : result.productId;
      if (entry.undone && entry.productId) void deleteProduct(entry.productId);
    });
  }

  function undo() {
    const entry = current.current;
    current.current = null;
    setAdded(false);
    if (!entry) return;
    entry.undone = true;
    if (entry.productId) void deleteProduct(entry.productId);
  }

  /** Forget the last add without undoing it, e.g. to track another link. */
  const reset = useCallback(() => {
    current.current = null;
    setAdded(false);
  }, []);

  return { added, track, undo, reset };
}
