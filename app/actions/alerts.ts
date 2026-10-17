"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { fail, type ActionResult } from "@/lib/action-result";
import { db } from "@/lib/db";
import { alerts } from "@/lib/db/schema";
import { getUser } from "@/lib/session";
import { uuidSchema } from "@/lib/validation";

export async function markAllAlertsRead(): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  await db
    .update(alerts)
    .set({ read_at: new Date().toISOString() })
    .where(and(eq(alerts.user_id, user.id), isNull(alerts.read_at)));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setAlertRead(id: string, read: boolean): Promise<ActionResult> {
  if (!uuidSchema.safeParse(id).success) return fail("Alert not found");
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  await db
    .update(alerts)
    .set({ read_at: read ? new Date().toISOString() : null })
    .where(and(eq(alerts.id, id), eq(alerts.user_id, user.id)));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteAlert(id: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(id).success) return fail("Alert not found");
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  await db.delete(alerts).where(and(eq(alerts.id, id), eq(alerts.user_id, user.id)));
  revalidatePath("/", "layout");
  return { ok: true };
}
