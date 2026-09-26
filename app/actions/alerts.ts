"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";

export async function markAllAlertsRead(): Promise<ActionResult> {
  const supabase = await createClient();
  await supabase
    .from("alerts")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  revalidatePath("/", "layout");
  return { ok: true };
}
