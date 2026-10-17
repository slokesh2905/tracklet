"use client";

import { useCallback } from "react";
import { Bookmark, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Opens Tracklet's share page with the page you are on. */
const script = (origin: string) => `javascript:(()=>{window.open('${origin}/share?url='+encodeURIComponent(location.href),'_blank')})()`;

/** Desktop counterpart of the phone's share sheet: a bookmark that sends the current page to Tracklet. */
export default function Bookmarklet({ origin }: { origin: string }) {
  const code = script(origin);
  // React refuses javascript: hrefs, so the link is given its href directly once it mounts.
  const link = useCallback(
    (node: HTMLAnchorElement | null) => {
      node?.setAttribute("href", code);
    },
    [code]
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Bookmarklet copied. Paste it as a new bookmark's address.");
    } catch {
      toast.error("Couldn't copy. Drag the button to your bookmarks bar instead.");
    }
  }

  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="font-semibold">Track from any page</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Drag this to your bookmarks bar. On any product page, click it to send the page to Tracklet.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          ref={link}
          onClick={(e) => e.preventDefault()}
          draggable
          className="inline-flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-sm font-medium"
        >
          <Bookmark className="size-4 text-primary" /> Track in Tracklet
        </a>
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void copy()}>
          <Copy className="size-3.5" /> Copy instead
        </Button>
      </div>
    </section>
  );
}
