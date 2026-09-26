"use client";

import { setProductPublic } from "@/app/actions/products";
import ShareControl from "@/components/ShareControl";

export default function ProductShare({
  productId,
  slug,
  isPublic,
  name,
}: {
  productId: string;
  slug: string;
  isPublic: boolean;
  name: string;
}) {
  return (
    <ShareControl
      isPublic={isPublic}
      path={`/p/${slug}`}
      label={name}
      onToggle={(next) => setProductPublic(productId, next)}
    />
  );
}
