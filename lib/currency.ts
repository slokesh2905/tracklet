export const SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "INR",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
  "CNY",
  "SGD",
  "SEK",
  "NZD",
  "MXN",
  "BRL",
  "KRW",
  "HKD",
  "PLN",
  "ZAR",
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

/** Units of each currency per 1 unit of `base`. */
export type Rates = { base: string; rates: Record<string, number> };

/**
 * Daily ECB reference rates from Frankfurter (free, no key). Cached for a day
 * by the Next.js data cache; on failure we fall back to "no conversion".
 */
export async function getRates(base: string): Promise<Rates> {
  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}`,
      { next: { revalidate: 60 * 60 * 24 } }
    );
    if (!res.ok) throw new Error(`FX ${res.status}`);
    const data = (await res.json()) as { rates: Record<string, number> };
    return { base, rates: { ...data.rates, [base]: 1 } };
  } catch {
    return { base, rates: { [base]: 1 } };
  }
}

/** Convert `amount` of `from` into `rates.base`, or null when no rate is known. */
export function convert(
  amount: number,
  from: string,
  rates: Rates
): number | null {
  if (from === rates.base) return amount;
  const rate = rates.rates[from];
  return rate ? amount / rate : null;
}
