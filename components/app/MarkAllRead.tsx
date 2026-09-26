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
      className="gap-1.5"
      disabled={pending}
      onClick={() => startTransition(async () => void (await markAllAlertsRead()))}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />}
      Mark all read
    </Button>
  );
}
