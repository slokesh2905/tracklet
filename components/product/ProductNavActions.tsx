"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Ellipsis, PlayCircle, RefreshCw, Share, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PRODUCT_NAV_SLOT } from "@/components/app/AppNav";
import { useProductActions } from "@/components/product/ProductActions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrigin } from "@/lib/hooks";

const findSlot = () => document.getElementById(PRODUCT_NAV_SLOT);
/** The layout's capsule may commit alongside this page, so look again on the next frame. */
const subscribeNextFrame = (onChange: () => void) => {
  const frame = requestAnimationFrame(onChange);
  return () => cancelAnimationFrame(frame);
};

type Props = {
  productId: string;
  name: string;
  url: string;
  slug: string;
  isPublic: boolean;
  paused: boolean;
};

/**
 * Share and ⋯ in the phone's top capsule. Share sends the public price page when it's on,
 * otherwise the store link, so a private history is never exposed by accident.
 */
export default function ProductNavActions({ productId, name, url, slug, isPublic, paused }: Props) {
  const slot = useSyncExternalStore(subscribeNextFrame, findSlot, () => null);
  const { pending, check, resume, askRemove, confirm } = useProductActions(productId);
  const origin = useOrigin();

  async function share() {
    const link = isPublic ? `${origin}/p/${slug}` : url;
    if (navigator.share) {
      try {
        await navigator.share({ title: name, url: link });
        return;
      } catch {
        /* dismissed */
      }
    }
    await navigator.clipboard.writeText(link);
    toast.success(isPublic ? "Price page link copied" : "Store link copied");
  }

  return (
    <>
      {slot &&
        createPortal(
          <>
            <button type="button" onClick={share} aria-label="Share" className="flex size-11 items-center justify-center rounded-xl">
              <Share className="size-5" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="More actions" className="flex size-11 items-center justify-center rounded-xl">
                  <Ellipsis className="size-[1.375rem]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {paused ? (
                  <DropdownMenuItem onSelect={resume} disabled={pending}>
                    <PlayCircle /> Resume checks
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={check} disabled={pending}>
                    <RefreshCw /> Check price now
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={askRemove}>
                  <Trash2 /> Stop tracking
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>,
          slot
        )}
      {confirm}
    </>
  );
}
