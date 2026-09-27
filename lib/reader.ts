import "server-only";
import { extractProductFromMarkdown, isAiEnabled } from "@/lib/ai";
import { createScraper } from "@/lib/scraper";

/**
 * The product reader used everywhere on the server: free direct fetch first,
 * then Firecrawl (1 credit) when a store blocks us, then free Nemotron as a last
 * resort. Works without a Firecrawl key for stores that allow direct fetches.
 */
export function makeScraper() {
  return createScraper({
    firecrawlApiKey: process.env.FIRECRAWL_API_KEY || undefined,
    llmExtract: isAiEnabled() ? extractProductFromMarkdown : undefined,
  });
}
