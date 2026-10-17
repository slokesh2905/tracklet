import CollectionsView from "@/components/app/CollectionsView";
import { getCollectionsWithCounts, getDashboardData } from "@/lib/data";

export const metadata = { title: "Collections" };

export default async function CollectionsPage() {
  const [collections, data] = await Promise.all([getCollectionsWithCounts(), getDashboardData()]);
  const products = data?.products ?? [];

  // How many products in each collection sit at their all-time low right now.
  const lows: Record<string, number> = {};
  for (const p of products) {
    if (p.collection_id && p.isAllTimeLow && p.status !== "new") lows[p.collection_id] = (lows[p.collection_id] ?? 0) + 1;
  }
  const unsorted = products.filter((p) => !p.collection_id);

  return (
    <CollectionsView
      collections={collections}
      lows={lows}
      unsorted={{ count: unsorted.length, images: unsorted.slice(0, 3).map((p) => p.image_url) }}
    />
  );
}
