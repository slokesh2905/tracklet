import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  BellRing,
  ChartSpline,
  FolderHeart,
  Globe,
  Link2,
  MailCheck,
  ScanSearch,
  Share2,
  Sparkles,
  Target,
} from "lucide-react";
import AddProductForm from "@/components/AddProductForm";
import DemoCard from "@/components/landing/DemoCard";
import SignInButton from "@/components/landing/SignInButton";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { DAY_MS } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";

const FEATURES = [
  { icon: Target, title: "Target-price alerts", body: "Set the price you’d pay, or a % drop. We only ping you when it matters." },
  { icon: ChartSpline, title: "Honest price history", body: "Step charts, 30/90-day ranges and a time-weighted average: see if a “sale” is real." },
  { icon: Sparkles, title: "AI buy-or-wait verdict", body: "A plain-English take grounded in the product’s own price data, not hype." },
  { icon: BellRing, title: "Email, Discord & digest", body: "Instant alerts where you already are, plus a Monday summary of every price move." },
  { icon: FolderHeart, title: "Collections & sharing", body: "Group products into wishlists and share a live price page with anyone." },
  { icon: Globe, title: "Any store, any currency", body: "Works on most shops. Totals convert to your currency with daily ECB rates." },
];

const STEPS = [
  { icon: Link2, title: "Paste a link", body: "Copy any product URL: Amazon, Flipkart, Best Buy, Myntra and more." },
  { icon: ScanSearch, title: "We check it daily", body: "Tracklet reads the price every day and builds its history." },
  { icon: MailCheck, title: "Buy at the right time", body: "Get alerted when it hits your target or an all-time low." },
];

/** Sample history ending today (server component: evaluated once per request). */
function demoHistory() {
  const now = Date.now();
  const prices = [29990, 29990, 27990, 28490, 26990, 27490, 25990, 26490, 24990, 23490];
  return prices.map((price, i) => ({
    price,
    checked_at: new Date(now - (120 - i * 13) * DAY_MS).toISOString(),
  }));
}

export default async function Home() {
  if (await getUser()) redirect("/dashboard");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16">
          <Logo />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Suspense>
              <SignInButton autoOpen />
            </Suspense>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--color-primary)_14%,transparent),transparent_60%)]" aria-hidden="true" />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-16 sm:pt-20 lg:grid-cols-2 lg:gap-16 lg:pb-24">
            <div className="flex flex-col items-start">
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                <Sparkles className="size-3.5 text-primary" /> Now with AI buy-or-wait verdicts
              </span>
              <h1 className="mt-5 text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                Buy at the <span className="text-primary">right price</span>, every time.
              </h1>
              <p className="mt-5 max-w-lg text-base text-pretty text-muted-foreground sm:text-lg">
                Tracklet watches prices on any online store, shows you the real price history, and alerts you the
                moment a product hits the price you want.
              </p>
              <div className="mt-8 w-full max-w-lg">
                <AddProductForm signedIn={false} size="hero" />
                <p className="mt-3 text-xs text-muted-foreground">Free · Sign in with Google, GitHub or email</p>
              </div>
            </div>
            <DemoCard history={demoHistory()} />
          </div>
        </section>

        <section className="border-y bg-muted/40">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
            <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>
            <ol className="mt-10 grid gap-6 sm:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="flex flex-col items-center text-center">
                  <span className="relative flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                    <Icon className="size-6" />
                    <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                  </span>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-1 max-w-xs text-sm text-muted-foreground">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">Everything you need to stop overpaying</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border bg-card p-5">
                <Icon className="size-5 text-primary" />
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20">
          <div className="flex flex-col items-center rounded-3xl bg-primary px-6 py-12 text-center text-primary-foreground sm:py-16">
            <Share2 className="size-8" />
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-balance sm:text-3xl">Your next purchase is probably cheaper next week.</h2>
            <p className="mt-2 max-w-md text-primary-foreground/80">Start tracking in under ten seconds.</p>
            <div className="mt-6 [&_button]:bg-background [&_button]:text-foreground [&_button:hover]:bg-background/90">
              <Suspense>
                <SignInButton label="Get started free" size="lg" />
              </Suspense>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t pb-safe">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row">
          <Logo className="text-foreground" />
          <p>Built with Next.js, Supabase, Firecrawl and the Vercel AI SDK.</p>
        </div>
      </footer>
    </div>
  );
}
