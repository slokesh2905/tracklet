const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/i;
/** Share sheets append punctuation to a link that ends a sentence. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

/**
 * The link in what another app shared to us. Store apps put it in `text` ("Check this out
 * https://amzn.in/d/abc"), browsers in `url`, so look through all three, `url` first.
 */
export function extractSharedUrl({ url, text, title }: { url?: string | null; text?: string | null; title?: string | null }) {
  for (const field of [url, text, title]) {
    const found = field?.match(URL_IN_TEXT)?.[0]?.replace(TRAILING_PUNCTUATION, "");
    if (found && URL.canParse(found)) return found;
  }
  return null;
}
