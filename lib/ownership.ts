import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiUsage, collections } from "@/lib/db/schema";

/** True when the collection exists and belongs to the user. */
export async function ownsCollection(userId: string, collectionId: string) {
  const row = await db.query.collections.findFirst({
    columns: { id: true },
    where: and(eq(collections.id, collectionId), eq(collections.user_id, userId)),
  });
  return Boolean(row);
}

/**
 * Atomically consume one AI call from the user's daily quota. A single
 * INSERT … ON CONFLICT DO UPDATE … RETURNING, so concurrent requests can't
 * both slip under the limit.
 */
export async function consumeAiQuota(userId: string, dailyLimit: number) {
  const [row] = await db
    .insert(aiUsage)
    .values({ user_id: userId, calls: 1 })
    .onConflictDoUpdate({
      target: [aiUsage.user_id, aiUsage.day],
      set: { calls: sql`${aiUsage.calls} + 1` },
    })
    .returning({ calls: aiUsage.calls });
  return (row?.calls ?? Infinity) <= dailyLimit;
}
