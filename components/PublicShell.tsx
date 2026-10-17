import Link from "next/link";
import GlassNav from "@/components/GlassNav";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="ambient min-h-dvh bg-muted/30">
      <GlassNav width="max-w-3xl" className="justify-between">
        <Logo />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button asChild size="sm">
            <Link href="/">Track prices free</Link>
          </Button>
        </div>
      </GlassNav>
      <main className="mx-auto max-w-3xl px-4 py-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">{children}</main>
    </div>
  );
}
