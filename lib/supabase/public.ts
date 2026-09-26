import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

/** Cookie-less anon client for public pages, so they can be statically cached. */
export function createPublicClient() {
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type SharedProduct = {
  name: string;
  url: string;
  image_url: string | null;
  current_price: number;
  original_price: number | null;
  currency: string;
  in_stock: boolean;
  lowest_price: number | null;
  highest_price: number | null;
  created_at: string;
  history: Array<{ price: number; checked_at: string }>;
};

export type SharedCollection = {
  name: string;
  products: Array<{
    name: string;
    url: string;
    image_url: string | null;
    current_price: number;
    currency: string;
    lowest_price: number | null;
    highest_price: number | null;
    share_slug: string;
  }>;
};

const SLUG = /^[a-f0-9]{12}$/;

export async function getSharedProduct(slug: string) {
  if (!SLUG.test(slug)) return null;
  const { data } = await createPublicClient().rpc("get_shared_product", { slug });
  return (data as SharedProduct | null) ?? null;
}

export async function getSharedCollection(slug: string) {
  if (!SLUG.test(slug)) return null;
  const { data } = await createPublicClient().rpc("get_shared_collection", { slug });
  return (data as SharedCollection | null) ?? null;
}
