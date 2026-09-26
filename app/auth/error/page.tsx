import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Sign-in problem" };

export default function AuthErrorPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-center shadow-sm">
        <TriangleAlert className="mx-auto size-10 text-danger" />
        <h1 className="mt-4 text-xl font-semibold">We couldn’t sign you in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The sign-in link may have expired or already been used. Please try again.
        </p>
        <Button asChild className="mt-6 w-full">
          <Link href="/?signin=1">Try again</Link>
        </Button>
      </div>
    </main>
  );
}
