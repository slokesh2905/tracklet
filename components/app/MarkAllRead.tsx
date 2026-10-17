"use client";

import { useTransition } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { markAllAlertsRead } from "@/app/actions/alerts";
import { Button } from "@/components/ui/button";

export default function MarkAllRead() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      // A plain orange text button on a phone, as in the header of the design.
      className="gap-1.5 max-md:h-11 max-md:border-0 max-md:bg-transparent max-md:pr-1 max-md:pl-2.5 max-md:text-sm max-md:text-primary max-md:shadow-none max-md:[&_svg]:size-[1.0625rem]"
      disabled={pending}
      onClick={() => startTransition(async () => void (await markAllAlertsRead()))}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />}
      Mark all read
    </Button>
  );
}
