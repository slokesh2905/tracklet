import Link from "next/link";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="border-b bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button asChild size="sm">
              <Link href="/">Track prices free</Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">{children}</main>
    </div>
  );
}
