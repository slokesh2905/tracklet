"use client";

import { useRouter } from "next/navigation";
import AddFlow from "@/components/app/AddFlow";
import type { CollectionRow } from "@/lib/db/schema";

/** A link shared into the app: read it straight away, then open the product once it is tracked. */
export default function ShareTrack({ url, collections }: { url: string; collections: Pick<CollectionRow, "id" | "name">[] }) {
  const router = useRouter();
  return <AddFlow initialUrl={url} collections={collections} onAdded={(id) => router.push(`/products/${id}`)} />;
}
