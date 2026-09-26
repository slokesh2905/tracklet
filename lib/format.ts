// A fixed locale keeps server and client output identical (no hydration mismatch).
const LOCALE = "en-US";

const SYMBOL_TO_CODE: Record<string, string> = {
  $: "USD",
  US$: "USD",
  "₹": "INR",
  RS: "INR",
  "RS.": "INR",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  C$: "CAD",
  A$: "AUD",
};

/** Map whatever the scraper returned ("$", "Rs.", "inr") to an ISO 4217 code. */
export function normalizeCurrency(
  raw: string | null | undefined,
  fallback = "USD"
) {
  if (!raw) return fallback;
  const value = raw.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(value)) return value;
  return SYMBOL_TO_CODE[value] ?? fallback;
}

/** Parse numbers like 1299, "1,299.00", "₹1,299" into a finite number, or null. */
export function parsePrice(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  }
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[^0-9.,]/g, "");
  if (!cleaned) return null;
  // "1.299,00" (EU) vs "1,299.00" (US): a comma followed by 1–2 digits is a decimal.
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const normalized =
    lastComma > lastDot && cleaned.length - lastComma <= 3
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function formatPrice(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      maximumFractionDigits: amount >= 1000 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatPercent(value: number, { signed = false } = {}) {
  const abs = Math.abs(value);
  const text = `${abs < 10 ? abs.toFixed(1) : abs.toFixed(0)}%`;
  if (!signed || value === 0) return text;
  return value > 0 ? `+${text}` : `−${text}`;
}

export function percentChange(from: number, to: number) {
  return from > 0 ? ((to - from) / from) * 100 : 0;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export function timeAgo(date: string | Date, now = Date.now()) {
  const diff = now - new Date(date).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 30 * DAY_MS) return `${Math.floor(diff / DAY_MS)}d ago`;
  return formatDate(date, { year: false });
}

export function formatDate(date: string | Date, { year = true } = {}) {
  return new Date(date).toLocaleDateString(LOCALE, {
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" } : {}),
  });
}

export function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
