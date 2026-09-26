"use client";

import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where to land after signing in (relative path). */
  next?: string;
};

function GoogleIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5 1 .1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}

export default function AuthModal({ open, onOpenChange, next = "/dashboard" }: Props) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<"google" | "github" | "email" | null>(null);
  const [sent, setSent] = useState(false);

  const redirectTo = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function signInWith(provider: "google" | "github") {
    setPending(provider);
    const { error } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectTo() },
    });
    if (error) {
      toast.error(error.message);
      setPending(null);
    }
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setPending("email");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo() },
    });
    setPending(null);
    if (error) toast.error(error.message);
    else setSent(true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Sign in to Tracklet</DialogTitle>
          <DialogDescription>
            Track prices and get alerts when they drop. Free, no credit card.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <p className="font-medium">Check your inbox</p>
            <p className="mt-1 text-muted-foreground">
              We sent a sign-in link to <span className="font-medium text-foreground">{email}</span>.
            </p>
            <Button variant="link" className="mt-2 h-auto p-0" onClick={() => setSent(false)}>
              Use a different email
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Button variant="outline" size="lg" className="w-full gap-2" disabled={pending !== null} onClick={() => signInWith("google")}>
              {pending === "google" ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon />}
              Continue with Google
            </Button>
            <Button variant="outline" size="lg" className="w-full gap-2" disabled={pending !== null} onClick={() => signInWith("github")}>
              {pending === "github" ? <Loader2 className="size-4 animate-spin" /> : <GitHubIcon />}
              Continue with GitHub
            </Button>

            <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
              <Separator className="flex-1" />
              or
              <Separator className="flex-1" />
            </div>

            <form onSubmit={sendMagicLink} className="flex flex-col gap-2">
              <label htmlFor="auth-email" className="sr-only">Email</label>
              <Input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" size="lg" className="w-full gap-2" disabled={pending !== null}>
                {pending === "email" ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                Email me a sign-in link
              </Button>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
