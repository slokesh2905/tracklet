"use server";

import { revalidatePath } from "next/cache";
import { fail, type ActionResult } from "@/lib/action-result";
import { createClient, getUser } from "@/lib/supabase/server";
import { collectionNameSchema, firstIssue, uuidSchema } from "@/lib/validation";

function revalidate() {
  revalidatePath("/collections");
  revalidatePath("/dashboard");
}

export async function createCollection(
  name: string
): Promise<ActionResult<{ id: string }>> {
  const parsed = collectionNameSchema.safeParse(name);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const user = await getUser();
  if (!user) return fail("Please sign in first");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collections")
    .insert({ name: parsed.data, user_id: user.id })
    .select("id")
    .single();
  if (error || !data) return fail("Couldn't create that collection");

  revalidate();
  return { ok: true, id: data.id, message: `Created “${parsed.data}”` };
}

export async function renameCollection(id: string, name: string): Promise<ActionResult> {
  const parsed = collectionNameSchema.safeParse(name);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if (!uuidSchema.safeParse(id).success) return fail("Invalid collection");

  const supabase = await createClient();
  const { error } = await supabase.from("collections").update({ name: parsed.data }).eq("id", id);
  if (error) return fail("Couldn't rename that collection");
  revalidate();
  return { ok: true, message: "Renamed" };
}

export async function deleteCollection(id: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(id).success) return fail("Invalid collection");
  const supabase = await createClient();
  const { error } = await supabase.from("collections").delete().eq("id", id);
  if (error) return fail("Couldn't delete that collection");
  revalidate();
  return { ok: true, message: "Collection deleted (products kept)" };
}

export async function setCollectionPublic(
  id: string,
  isPublic: boolean
): Promise<ActionResult<{ slug: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collections")
    .update({ is_public: isPublic })
    .eq("id", id)
    .select("share_slug")
    .single();
  if (error || !data) return fail("Couldn't update sharing");
  revalidate();
  return { ok: true, slug: data.share_slug };
}
