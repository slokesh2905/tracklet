/**
 * Free direct page fetch. Many stores (e.g. Flipkart) serve full product pages,
 * JSON-LD included, to a normal browser request; others (e.g. Amazon) answer
 * with a bot check, which we detect so the caller can fall back to Firecrawl.
 */

const BROWSER_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-IN,en;q=0.9",
};

const BLOCK_MARKERS = /api-services-support|captcha|robot check|are you a human|access denied|cf-chl-|verify you are human/i;

/** Cap how much HTML we read; product data sits in the first few MB at most. */
const MAX_BYTES = 4_000_000;

export type DirectPage = { finalUrl: string; html: string };

export function looksBlocked(status: number, html: string) {
  return status >= 400 || (html.length < 20_000 && BLOCK_MARKERS.test(html));
}

/** Returns the page, or null when it's blocked, errors or times out. Never throws. */
export async function fetchDirect(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = 10_000): Promise<DirectPage | null> {
  try {
    const res = await fetchImpl(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!(res.headers.get("content-type") ?? "").includes("html")) return null;
    const html = (await res.text()).slice(0, MAX_BYTES);
    if (looksBlocked(res.status, html)) return null;
    return { finalUrl: res.url || url, html };
  } catch {
    return null;
  }
}
