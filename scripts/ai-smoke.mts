/**
 * Calls the real AI features against the configured provider.
 *   node --conditions=react-server --import tsx scripts/ai-smoke.mts
 * (react-server makes the `server-only` guard a no-op outside Next.js.)
 */
for (const file of [".env.development.local", ".env.local"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Missing file: fine.
  }
}

const { aiModelId, pickAiProvider } = await import("../lib/ai-provider");
const { categorizeProduct, extractProductFromMarkdown, generateDealVerdict } = await import("../lib/ai");
const { computeInsights } = await import("../lib/insights");

const DAY = 86_400_000;
const now = Date.now();
const history = [
  [120, 29990], [94, 28490], [68, 27490], [42, 26490], [29, 24990], [3, 23490],
].map(([d, price]) => ({ price: price!, checked_at: new Date(now - d! * DAY).toISOString() }));

console.log(`provider=${pickAiProvider()} model=${aiModelId()}\n`);

async function time<T>(label: string, fn: () => Promise<T>) {
  const t = Date.now();
  try {
    const out = await fn();
    console.log(`✓ ${label} (${Date.now() - t} ms)`, JSON.stringify(out, null, 1));
  } catch (error) {
    console.log(`✗ ${label} (${Date.now() - t} ms)`, error instanceof Error ? `${error.name}: ${error.message}` : error);
  }
}

await time("deal verdict", () =>
  generateDealVerdict({
    name: "Sony WH-1000XM5 Wireless Headphones",
    currentPrice: 23490,
    currency: "INR",
    originalPrice: 34990,
    inStock: true,
    insights: computeInsights(history, 23490, now),
  })
);

await time("categorize", () => categorizeProduct("Dyson V12 Detect Slim Cordless Vacuum Cleaner"));

await time("extraction fallback", () =>
  extractProductFromMarkdown(
    "https://shop.example/kettle",
    "# Philips HD9350 Electric Kettle 1.7L\n\n~~₹2,995~~ **₹1,799** (40% off)\n\nIn stock. Free delivery.\n\n![kettle](https://cdn.example/kettle.jpg)"
  )
);
