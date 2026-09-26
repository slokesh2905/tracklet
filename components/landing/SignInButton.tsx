"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import AuthModal from "@/components/AuthModal";
import { Button } from "@/components/ui/button";

/** Opens automatically on `/?signin=1` (the proxy sends signed-out visitors here). */
export default function SignInButton({
  label = "Sign in",
  size = "sm",
  autoOpen = false,
}: {
  label?: string;
  size?: "sm" | "lg";
  autoOpen?: boolean;
}) {
  const params = useSearchParams();
  const [open, setOpen] = useState(autoOpen && params.get("signin") === "1");
  const next = params.get("next") ?? "/dashboard";

  return (
    <>
      <Button size={size} className="gap-2" onClick={() => setOpen(true)}>
        <LogIn className="size-4" /> {label}
      </Button>
      <AuthModal open={open} onOpenChange={setOpen} next={next} />
    </>
  );
}
