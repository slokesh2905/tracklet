"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, PlayCircle, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteProduct, refreshProduct, resumeChecks } from "@/app/actions/products";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { hostname } from "@/lib/format";

type Props = {
  productId: string;
  url: string;
  paused: boolean;
  /** Phone layout at the end of the page: quiet text buttons, no store button (the pinned bar has it). */
  footer?: boolean;
};

export default function ProductActions({ productId, url, paused, footer = false }: Props) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className={footer ? "flex flex-col items-stretch gap-1 md:hidden" : "grid grid-cols-2 gap-2 max-md:hidden sm:flex sm:flex-wrap"}>
      {!footer && (
        <Button asChild className="col-span-2 gap-2 sm:col-auto">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" /> View on {hostname(url)}
          </a>
        </Button>
      )}
      {paused ? (
        <Button
          variant={footer ? "ghost" : "outline"}
          className="gap-2 pointer-coarse:h-11"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await resumeChecks(productId);
              if (r.ok) toast.success(r.message);
              else toast.error(r.error);
            })
          }
        >
          <PlayCircle className="size-4" /> Resume checks
        </Button>
      ) : (
        <Button
          variant={footer ? "ghost" : "outline"}
          className="gap-2 pointer-coarse:h-11"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await refreshProduct(productId);
              if (r.ok) toast.success("Price is up to date");
              else toast.error(r.error);
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Check now
        </Button>
      )}
      <Button variant={footer ? "ghost" : "outline"} className="gap-2 text-danger hover:text-danger pointer-coarse:h-11" onClick={() => setConfirmOpen(true)}>
        <Trash2 className="size-4" /> {footer ? "Stop tracking" : "Remove"}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Stop tracking this product?"
        description="Its price history and alerts will be deleted. This can't be undone."
        confirmLabel="Stop tracking"
        destructive
        onConfirm={async () => {
          const r = await deleteProduct(productId);
          if (r.ok) {
            toast.success(r.message);
            router.push("/dashboard");
          } else {
            toast.error(r.error);
          }
        }}
      />
    </div>
  );
}
