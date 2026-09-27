const RETAILER_NAMES: Record<string, string> = {
  amazon: "Amazon",
  flipkart: "Flipkart",
  myntra: "Myntra",
  ajio: "AJIO",
  croma: "Croma",
  tatacliq: "Tata CLiQ",
  nykaa: "Nykaa",
  reliancedigital: "Reliance Digital",
  jiomart: "JioMart",
  vijaysales: "Vijay Sales",
};

/** Display name for a retailer slug from lib/product-key ("tatacliq" → "Tata CLiQ"). */
export const retailerName = (slug: string) => RETAILER_NAMES[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
