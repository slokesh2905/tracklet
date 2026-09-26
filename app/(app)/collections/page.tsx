import CollectionsView from "@/components/app/CollectionsView";
import { getCollectionsWithCounts } from "@/lib/data";

export const metadata = { title: "Collections" };

export default async function CollectionsPage() {
  const collections = await getCollectionsWithCounts();
  return <CollectionsView collections={collections} />;
}
