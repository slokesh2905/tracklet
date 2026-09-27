import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ImageOff } from "lucide-react";
import PublicShell from "@/components/PublicShell";
import { formatPrice, hostname } from "@/lib/format";
import { getSharedCollection } from "@/lib/share";

export const revalidate = 3600;

// Rendered on first visit, then cached (ISR) and purged when sharing changes.
export function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getSharedCollection(slug);
  return { title: collection ? `${collection.name} (wishlist)` : "Not found" };
}

export default async function SharedCollectionPage({ params }: Params) {
  const { slug } = await params;
  const collection = await getSharedCollection(slug);
  if (!collection) notFound();

  return (
    <PublicShell>
      <h1 className="text-2xl font-bold tracking-tight">{collection.name}</h1>
      <p className="text-sm text-muted-foreground">
        A shared wishlist · {collection.products.length} product{collection.products.length === 1 ? "" : "s"}, prices checked daily
      </p>
      <ul className="mt-6 flex flex-col overflow-hidden rounded-xl border bg-card">
        {collection.products.map((p) => {
          const current = Number(p.current_price);
          const atLow = p.lowest_price !== null && p.highest_price !== null && Number(p.highest_price) > Number(p.lowest_price) && current <= Number(p.lowest_price);
          return (
            <li key={p.share_slug} className="border-b last:border-b-0">
              <Link href={`/p/${p.share_slug}`} className="flex items-center gap-3 p-3 hover:bg-accent/50 sm:p-4">
                <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white">
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt="" loading="lazy" className="size-full object-contain p-1" />
                  ) : (
                    <ImageOff className="size-4 text-muted-foreground" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{hostname(p.url)}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold tabular-nums">{formatPrice(current, p.currency)}</span>
                  {atLow && <span className="text-xs font-medium text-success">All-time low</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </PublicShell>
  );
}
