import Link from "next/link";
import { Link2Off } from "lucide-react";
import ShareTrack from "@/components/app/ShareTrack";
import { Button } from "@/components/ui/button";
import { getCollectionList } from "@/lib/data";
import { extractSharedUrl } from "@/lib/share-url";

export const metadata = { title: "Track a product" };

type SearchParams = Promise<{ url?: string; text?: string; title?: string }>;

/** Where the installed app's share-sheet entry and the "track from any page" bookmarklet land. */
export default async function SharePage({ searchParams }: { searchParams: SearchParams }) {
  const shared = extractSharedUrl(await searchParams);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <div>
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight md:text-2xl">Track a product</h1>
        <p className="text-sm text-muted-foreground">Check it&apos;s the right one, then choose an alert.</p>
      </div>

      {shared ? (
        <ShareTrack url={shared} collections={await getCollectionList()} />
      ) : (
        <section className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
          <Link2Off className="size-10 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">We couldn&apos;t find a link</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Share a product page from a store app or browser, or paste its link on the dashboard.
          </p>
          <Button asChild className="mt-4">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </section>
      )}
    </div>
  );
}
