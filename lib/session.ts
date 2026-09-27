import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** The signed-in user for this request, or null (deduplicated across a render). */
export const getUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
});

/** The signed-in user; redirects to sign-in when there is none. */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/?signin=1");
  return user;
}
