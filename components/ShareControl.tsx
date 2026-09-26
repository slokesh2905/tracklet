"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Globe, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { ActionResult } from "@/lib/action-result";
import { useOrigin } from "@/lib/hooks";

type Props = {
  isPublic: boolean;
  path: string;
  label: string;
  onToggle: (next: boolean) => Promise<ActionResult<{ slug: string }>>;
};

export default function ShareControl({ isPublic, path, label, onToggle }: Props) {
  const [enabled, setEnabled] = useState(isPublic);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const url = `${useOrigin()}${path}`;

  function toggle(next: boolean) {
    setEnabled(next);
    startTransition(async () => {
      const result = await onToggle(next);
      if (!result.ok) {
        setEnabled(!next);
        toast.error(result.error);
      }
    });
  }

  async function share() {
    // Native share sheet on phones; clipboard elsewhere.
    if (navigator.share) {
      try {
        await navigator.share({ title: label, url });
        return;
      } catch {
        /* dismissed */
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-2 text-sm">
          {enabled ? <Globe className="size-4 text-primary" /> : <Lock className="size-4 text-muted-foreground" />}
          <span>
            <span className="font-medium">{enabled ? "Public link on" : "Private"}</span>
            <span className="block text-xs text-muted-foreground">
              {enabled ? "Anyone with the link can view the price history" : "Only you can see this"}
            </span>
          </span>
        </span>
        <Switch checked={enabled} onCheckedChange={toggle} disabled={pending} aria-label={`Share ${label}`} />
      </label>
      {enabled && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-1.5 pl-3">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{url}</span>
          <Button size="sm" variant="secondary" onClick={share} className="shrink-0 gap-1.5">
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            Share
          </Button>
        </div>
      )}
    </div>
  );
}
