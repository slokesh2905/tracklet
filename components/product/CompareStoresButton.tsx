"use client";

import { useTransition } from "react";
import { Loader2, Store } from "lucide-react";
import { toast } from "sonner";
import { compareStores } from "@/app/actions/products";
import { Button } from "@/components/ui/button";

export default function CompareStoresButton({
  productId,
  label = "Compare stores",
  variant = "outline",
  className,
}: {
  productId: string;
  label?: string;
  variant?: "outline" | "default" | "secondary";
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={variant}
      className={className ?? "gap-2"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await compareStores(productId);
          if (r.ok) toast.success(r.message ?? "Compared stores");
          else toast.error(r.error);
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Store className="size-4" />}
      {pending ? "Checking other stores…" : label}
    </Button>
  );
}
