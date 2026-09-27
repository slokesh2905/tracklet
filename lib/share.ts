import "server-only";
import { and, asc, desc, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { catalogItems, collections, priceHistory, products } from "@/lib/db/schema";

// Public share pages. Only the whitelisted columns below ever leave the server,
// and only for rows the owner made public (directly or via a public collection).

const SLUG = /^[a-f0-9]{12}$/;

export async function getSharedProduct(slug: string) {
  if (!SLUG.test(slug)) return null;

  const [row] = await db
    .select({
      itemId: catalogItems.id,
      name: catalogItems.name,
      url: catalogItems.url,
      image_url: catalogItems.image_url,
      current_price: catalogItems.current_price,
      original_price: catalogItems.original_price,
      currency: catalogItems.currency,
      in_stock: catalogItems.in_stock,
      lowest_price: catalogItems.lowest_price,
      highest_price: catalogItems.highest_price,
      created_at: products.created_at,
    })
    .from(products)
    .innerJoin(catalogItems, eq(catalogItems.id, products.catalog_item_id))
    .leftJoin(collections, eq(collections.id, products.collection_id))
    .where(and(eq(products.share_slug, slug), or(eq(products.is_public, true), eq(collections.is_public, true))));
  if (!row) return null;

  const history = await db
    .select({ price: priceHistory.price, checked_at: priceHistory.checked_at })
    .from(priceHistory)
    .where(eq(priceHistory.catalog_item_id, row.itemId))
    .orderBy(asc(priceHistory.checked_at));

  const { itemId: _id, ...product } = row;
  return { ...product, history };
}

export type SharedProduct = NonNullable<Awaited<ReturnType<typeof getSharedProduct>>>;

export async function getSharedCollection(slug: string) {
  if (!SLUG.test(slug)) return null;

  const collection = await db.query.collections.findFirst({
    columns: { name: true },
    where: and(eq(collections.share_slug, slug), eq(collections.is_public, true)),
    with: {
      products: {
        columns: { share_slug: true },
        orderBy: desc(products.created_at),
        with: {
          item: {
            columns: {
              name: true,
              url: true,
              image_url: true,
              current_price: true,
              currency: true,
              lowest_price: true,
              highest_price: true,
            },
          },
        },
      },
    },
  });
  if (!collection) return null;
  return {
    name: collection.name,
    products: collection.products.map((p) => ({ share_slug: p.share_slug, ...p.item })),
  };
}
