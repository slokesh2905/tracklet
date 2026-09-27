import "server-only";

export type CreditUsage = { remainingCredits: number; periodEnd: string };

/**
 * Remaining Firecrawl credits in the current (free) billing period. Cached for
 * an hour by the Next.js data cache; the call itself costs no credits.
 * Returns null when there's no key or the API is unreachable, in which case
 * optional credit spending (comparisons) is skipped.
 */
export async function getFirecrawlCredits(): Promise<CreditUsage | null> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/team/credit-usage", {
      headers: { Authorization: `Bearer ${key}` },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { remainingCredits?: number; billingPeriodEnd?: string } };
    const { remainingCredits, billingPeriodEnd } = body.data ?? {};
    if (typeof remainingCredits !== "number" || !billingPeriodEnd) return null;
    return { remainingCredits, periodEnd: billingPeriodEnd };
  } catch {
    return null;
  }
}
