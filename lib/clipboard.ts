import { extractSharedUrl } from "@/lib/share-url";

/**
 * The link on the clipboard, read only when the browser already allows it without asking.
 * Reading otherwise pops a permission prompt (Chrome) or a Paste bubble (Safari) the moment a
 * page opens, which is worse than not offering at all; the Paste buttons cover those browsers.
 */
export async function readClipboardLinkQuietly(): Promise<string | null> {
  try {
    if (!navigator.clipboard?.readText || !navigator.permissions) return null;
    // Firefox and Safari don't know "clipboard-read" and throw, which lands in the catch.
    const status = await navigator.permissions.query({ name: "clipboard-read" as PermissionName });
    if (status.state !== "granted") return null;
    return extractSharedUrl({ text: await navigator.clipboard.readText() });
  } catch {
    return null;
  }
}
