"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronLeft, FolderHeart, LayoutGrid, LogOut, Plus, Settings } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import TrackSheet from "@/components/app/TrackSheet";
import GlassNav from "@/components/GlassNav";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Products", icon: LayoutGrid },
  { href: "/collections", label: "Collections", icon: FolderHeart },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    pathname === href ||
    pathname.startsWith(`${href}/`) ||
    (href === "/dashboard" && pathname.startsWith("/products/"));
}

function UnreadDot({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] leading-none font-semibold tracking-caption text-primary-foreground tabular-nums",
        className
      )}
      aria-label={`${count} unread`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function AppHeader({ email, unreadAlerts }: { email: string; unreadAlerts: number }) {
  const isActive = useIsActive();
  const pathname = usePathname();
  const initial = email.charAt(0).toUpperCase() || "?";
  const onProduct = pathname.startsWith("/products/");

  return (
    <>
    {onProduct && (
      <GlassNav className="px-1 md:hidden">
        <Link
          href="/dashboard"
          className="flex h-11 items-center rounded-xl pr-3 pl-0.5 text-base font-medium"
          aria-label="Back to products"
        >
          <ChevronLeft className="size-6" /> Products
        </Link>
      </GlassNav>
    )}
    <GlassNav className="gap-4 sm:h-16" headerClassName={cn(onProduct && "max-md:hidden")}>
        <Logo href="/dashboard" />

        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium",
                isActive(href) ? "bg-foreground/[0.08] text-foreground" : "text-foreground/65 hover:bg-foreground/[0.05] hover:text-foreground"
              )}
            >
              {label}
              {href === "/alerts" && <UnreadDot count={unreadAlerts} />}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
                <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                  {initial}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void signOut()}>
                <LogOut /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
    </GlassNav>
    </>
  );
}

export function MobileTabBar({ unreadAlerts }: { unreadAlerts: number }) {
  const isActive = useIsActive();
  const pathname = usePathname();
  const [trackOpen, setTrackOpen] = useState(false);

  // Product pages pin their own action bar in this spot.
  if (pathname.startsWith("/products/")) return null;

  const tab = (item: (typeof NAV)[number]) => {
    const { href, label, icon: Icon } = item;
    const active = isActive(href);
    return (
      <li key={href} className="min-w-0 flex-1">
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[0.6875rem] font-medium tracking-caption",
            active ? "bg-foreground/[0.08] text-primary" : "text-foreground/65"
          )}
        >
          <span className="relative">
            <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
            {href === "/alerts" && <UnreadDot count={unreadAlerts} className="absolute -top-1.5 -right-2.5" />}
          </span>
          {label}
        </Link>
      </li>
    );
  };

  return (
    <>
      <nav
        className="glass fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-40 rounded-3xl border border-glass-edge p-1 shadow-lg shadow-black/10 md:hidden"
        aria-label="Main"
      >
        <ul className="flex">
          {NAV.slice(0, 2).map(tab)}
          <li className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setTrackOpen(true)}
              aria-label="Track a product"
              className="flex h-14 w-full flex-col items-center justify-center gap-1 text-[0.6875rem] font-semibold tracking-caption text-primary"
            >
              <span className="flex h-[1.875rem] w-[2.625rem] items-center justify-center rounded-[0.6875rem] bg-primary text-primary-foreground shadow-md shadow-primary/40">
                <Plus className="size-5" strokeWidth={2.4} />
              </span>
              Track
            </button>
          </li>
          {NAV.slice(2).map(tab)}
        </ul>
      </nav>
      <TrackSheet open={trackOpen} onOpenChange={setTrackOpen} />
    </>
  );
}
