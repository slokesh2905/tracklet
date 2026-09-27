/**
 * Calls the real AI features against the configured provider.
 *   npm run ai:smoke
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
const { categorizeProduct, extractProductFromMarkdown, generateDealVerdict, judgeSameProduct } = await import("../lib/ai");
const { computeInsights } = await import("../lib/insights");
const { buildEvidence, gateVerdict } = await import("../lib/evidence");
type Offers = Parameters<typeof buildEvidence>[0]["offers"];

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

async function verdictCase(label: string, points: typeof history, offers: Offers) {
  const price = points.at(-1)!.price;
  const evidence = buildEvidence({
    currentPrice: price,
    currency: "INR",
    originalPrice: 34990,
    inStock: true,
    firstSeen: points[0]!.checked_at,
    shoppers: 2,
    insights: computeInsights(points, price, now),
    offers,
  });
  const gate = gateVerdict(evidence);
  if (gate.kind === "insufficient") {
    console.log(`• ${label}: gate=insufficient, no AI call (trend unlocks ${gate.readyOn.slice(0, 10)})`);
    return;
  }
  await time(`${label} [gate=${gate.kind}]`, () =>
    generateDealVerdict({ name: "Sony WH-1000XM5 Wireless Headphones", evidence, gate })
  );
}

await verdictCase("4 months of history", history, []);
await verdictCase("new product, no other stores", history.slice(-1), []);
await verdictCase("new product, cheaper at Croma", history.slice(-1), [
  { retailer: "croma", url: "https://www.croma.com/p/1", price: 22490, currency: "INR", inStock: true, match: "exact", checkedAt: new Date().toISOString() },
]);

await time("judge: same item", () =>
  judgeSameProduct("Sony WH-1000XM5 Wireless Headphones (Black)", "Sony WH-1000XM5 Bluetooth Headphones, Black")
);
await time("judge: different model", () =>
  judgeSameProduct("Sony WH-1000XM5 Wireless Headphones", "Sony WH-1000XM4 Wireless Headphones")
);

await time("categorize", () => categorizeProduct("Dyson V12 Detect Slim Cordless Vacuum Cleaner"));

await time("extraction fallback", () =>
  extractProductFromMarkdown(
    "https://shop.example/kettle",
    "# Philips HD9350 Electric Kettle 1.7L\n\n~~₹2,995~~ **₹1,799** (40% off)\n\nIn stock. Free delivery.\n\n![kettle](https://cdn.example/kettle.jpg)"
  )
);
