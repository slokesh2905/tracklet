/** A deal you can act on: high score, enough history, and actually in stock. */
export function isGreatDeal(p: { dealScore: number; status: string; in_stock: boolean }) {
  return p.dealScore >= 80 && p.status !== "new" && p.in_stock;
}
