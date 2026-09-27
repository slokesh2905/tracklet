import type { ExtractMethod } from "@/lib/extract";

/** A move bigger than this (vs the last confirmed price) must be seen twice before it counts. */
export const BIG_MOVE = 0.6;
/** Two readings within this relative distance agree. */
export const AGREE_WITHIN = 0.02;

export type GuardInput = {
  price: number;
  /** List price / MRP from the same reading, if the page showed one. */
  originalPrice: number | null;
  method: ExtractMethod;
  /** Last committed price (null for the very first reading). */
  lastConfirmed: number | null;
  /** A held reading from a previous check, awaiting confirmation. */
  pending: number | null;
};

export type GuardDecision =
  | { action: "accept"; confirmed: boolean }
  | { action: "hold"; reason: string }
  | { action: "reject"; reason: string };

const agrees = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b) <= AGREE_WITHIN;

/**
 * Decide whether a scraped price can be committed to history (and alert on).
 *
 * - reject: impossible on its face (≤0, or wildly off the page's own MRP). A
 *   "₹25" reading for a ₹5,995-MRP product is a misread label, not a sale.
 * - hold:   plausible but surprising (a >60% move, or any change read by the
 *   LLM fallback). Stored as pending and committed only when the next reading
 *   agrees, so one bad scrape can't corrupt history or fire a false alert.
 * - accept: everything else; `confirmed` marks that a held reading was verified.
 */
export function guardPrice({ price, originalPrice, method, lastConfirmed, pending }: GuardInput): GuardDecision {
  if (!Number.isFinite(price) || price <= 0) return { action: "reject", reason: "no usable price" };

  if (originalPrice && (price < originalPrice * 0.05 || price > originalPrice * 1.5)) {
    return { action: "reject", reason: "price is implausible against the listed MRP" };
  }

  if (pending !== null && agrees(price, pending)) return { action: "accept", confirmed: true };

  if (lastConfirmed === null) return { action: "accept", confirmed: false };

  if (agrees(price, lastConfirmed)) return { action: "accept", confirmed: false };

  const move = Math.abs(price - lastConfirmed) / lastConfirmed;
  if (move > BIG_MOVE) return { action: "hold", reason: `${Math.round(move * 100)}% move needs a second reading` };
  if (method === "llm") return { action: "hold", reason: "AI-read price change needs a second reading" };

  return { action: "accept", confirmed: false };
}
