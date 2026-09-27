"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { fail, type ActionResult } from "@/lib/action-result";
import { db } from "@/lib/db";
import { collections } from "@/lib/db/schema";
import { getUser } from "@/lib/session";
import { collectionNameSchema, firstIssue, uuidSchema } from "@/lib/validation";

function revalidate() {
  revalidatePath("/collections");
  revalidatePath("/dashboard");
}

const owned = (id: string, userId: string) => and(eq(collections.id, id), eq(collections.user_id, userId));

export async function createCollection(name: string): Promise<ActionResult<{ id: string }>> {
  const parsed = collectionNameSchema.safeParse(name);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  const [row] = await db
    .insert(collections)
    .values({ name: parsed.data, user_id: user.id })
    .returning({ id: collections.id });
  if (!row) return fail("Couldn't create that collection");

  revalidate();
  return { ok: true, id: row.id, message: `Created “${parsed.data}”` };
}

export async function renameCollection(id: string, name: string): Promise<ActionResult> {
  const parsed = collectionNameSchema.safeParse(name);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if (!uuidSchema.safeParse(id).success) return fail("Invalid collection");
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  const updated = await db
    .update(collections)
    .set({ name: parsed.data })
    .where(owned(id, user.id))
    .returning({ id: collections.id });
  if (updated.length === 0) return fail("Couldn't rename that collection");
  revalidate();
  return { ok: true, message: "Renamed" };
}

export async function deleteCollection(id: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(id).success) return fail("Invalid collection");
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  const deleted = await db.delete(collections).where(owned(id, user.id)).returning({ slug: collections.share_slug });
  if (deleted.length === 0) return fail("Couldn't delete that collection");
  revalidate();
  revalidatePath(`/c/${deleted[0]!.slug}`);
  return { ok: true, message: "Collection deleted (products kept)" };
}

export async function setCollectionPublic(
  id: string,
  isPublic: boolean
): Promise<ActionResult<{ slug: string }>> {
  if (!uuidSchema.safeParse(id).success) return fail("Invalid collection");
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  const [row] = await db
    .update(collections)
    .set({ is_public: isPublic })
    .where(owned(id, user.id))
    .returning({ slug: collections.share_slug });
  if (!row) return fail("Couldn't update sharing");

  revalidate();
  // Also purges the product pages reached through this collection.
  revalidatePath(`/c/${row.slug}`);
  revalidatePath("/p/[slug]", "page");
  return { ok: true, slug: row.slug };
}
