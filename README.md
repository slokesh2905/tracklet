<div align="center">

# Tracklet

**Buy at the right price, every time.**

Track prices from any online store, see an honest price history, and get alerted the moment a product hits the price you want.

**[Live demo → tracklet-seven.vercel.app](https://tracklet-seven.vercel.app)** · sign in with Google

[![CI](https://github.com/slokesh2905/tracklet/actions/workflows/ci.yml/badge.svg)](https://github.com/slokesh2905/tracklet/actions/workflows/ci.yml)
![Next.js 16](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![Neon](https://img.shields.io/badge/Neon-Postgres-00e599)
![Drizzle](https://img.shields.io/badge/Drizzle-ORM-c5f74f)

</div>

<p align="center">
  <img src="docs/screenshots/dashboard-desktop.png" alt="Tracklet dashboard" width="760" />
</p>
<p align="center">
  <img src="docs/screenshots/product-desktop.png" alt="Product price history, insights and alert rules" width="760" />
</p>
<p align="center">
  <img src="docs/screenshots/dashboard-mobile.png" alt="Dashboard on a phone" width="240" />
  &nbsp;
  <img src="docs/screenshots/product-mobile.png" alt="Product detail on a phone" width="240" />
  &nbsp;
  <img src="docs/screenshots/alerts-mobile.png" alt="Alerts on a phone" width="240" />
</p>

## Features

- **Home that leads with what to act on.** Swipeable cards for target hits, new all-time lows and big drops (with the AI verdict and a store button), the total saved, and how close each product is to its target.
- **Track any store, reliably.** Paste a link, a share link like `dl.flipkart.com/s/…`, or 20 links at once. Every link is previewed first, with its existing price history, so you can set an alert and pick a collection in the same step. Prices are read from each page's own structured data (JSON-LD, OpenGraph, retailer selectors), with Firecrawl and an LLM only as fallbacks. A **price guard** rejects misreads (e.g. a "₹25" label on a ₹5,995-MRP item) and holds surprising jumps until a second reading confirms them, so a bad scrape can never trigger a false alert.
- **Shared, honest price history.** Products are identified by retailer ID (Amazon ASIN, Flipkart pid, Myntra ID…), so every shopper tracking the same product pools one history, and new trackers see prices recorded before they arrived. Older prices are backfilled once from **Internet Archive** snapshots. Untracked items keep a free weekly check for 90 days, and a reading after a long silence is marked as a gap, so the chart and statistics never pretend to know what happened in between.
- **Cross-store comparison.** Finds the same item on Amazon, Flipkart, Myntra, Tata CLiQ, Croma and more, with an LLM judge that separates *exact* matches from similar variants.
- **Smart alerts.** Set a target price or a minimum % drop. You're alerted when the price *crosses* the target, when it hits a new all-time low, or when an item is back in stock. Delivery by email (React Email via Gmail SMTP, or Resend), web push to every device that opted in, and Discord webhook, plus a weekly digest.
- **Is the discount real?** Flags a list price that was never charged while the product was tracked, and a price raised shortly before a "sale". Shown on cards and the product page, and fed to the AI verdict.
- **Honest price insights.** Step-function charts with 7D/30D/90D/All ranges, time-weighted averages, 30/90-day ranges, a regression trend, and a **0–100 deal score**.
- **Evidence-based "buy now or wait?".** Code decides what the evidence supports (enough history, a cheaper exact match elsewhere, or not enough data yet) and computes confidence from data coverage. NVIDIA Nemotron (free API, via the AI SDK) only chooses buy/wait/fair and explains, citing the numbers. A product added today gets facts (discount off MRP, other stores) instead of an empty low-confidence verdict.
- **Collections & sharing.** Group products into wishlists. Public product and collection pages are cached with ISR and get generated Open Graph images.
- **Multi-currency.** Totals convert into your preferred currency using daily ECB rates.
- **Mobile-first PWA.** Installable, with a bottom tab bar (Home, Products, Track, Alerts, Collections), bottom-sheet dialogs, swipe actions, 44px touch targets, safe-area insets and keyboard-aware sheets. On Android it is a share target, so you can share a product straight from a store's app; on desktop, a bookmarklet tracks the page you're on. E2E tests fail on horizontal overflow at every viewport.
- CSV export, dark mode, and sign-in with Google, GitHub or an email magic link (Better Auth).

## Architecture

```mermaid
flowchart LR
  U[Browser / PWA] -->|Server Actions| N[Next.js 16 App Router]
  N -->|Drizzle, user-scoped data layer| DB[(Neon Postgres)]
  N <-->|sessions, OAuth, magic links| BA[Better Auth]
  BA --> DB
  N -->|scrape| FC[Firecrawl]
  N -->|verdicts, categories| AI[Vercel AI Gateway]
  C[Vercel Cron] -->|daily| P[Price-check pipeline]
  P -->|service role| DB
  P -->|1 scrape per distinct URL| FC
  P --> E[Email: Gmail / Resend]
  P --> WP[Web push]
  P --> D[Discord webhook]
  C -->|daily| B[History backfill]
  B -->|snapshots| IA[Internet Archive]
  B --> DB
  A[Anonymous visitor] -->|whitelisted share queries| N
```

### Engineering highlights

| Area | What was done |
| --- | --- |
| **Catalog model** ([lib/db/schema.ts](lib/db/schema.ts), [lib/product-key.ts](lib/product-key.ts), [lib/catalog.ts](lib/catalog.ts)) | `catalog_items` hold one row per real product, keyed by retailer ID after resolving share links; `products` are per-user tracking rows (alert rules, collection, sharing). History, AI verdicts and store offers hang off the catalog item, so they're shared. Duplicates found later are merged transactionally. |
| **Scalable pipeline** ([lib/pipeline.ts](lib/pipeline.ts)) | Visits the stalest catalog items first, **once per product however many users track it**, then fans alerts out to every tracker's own rules. Bounded concurrency, exponential-backoff retries, a time budget under the function limit, auto-pause after 5 failures, and per-run metrics (including held and rejected readings) in `check_runs`. |
| **History upkeep** ([lib/archive.ts](lib/archive.ts), [app/api/cron/backfill](app/api/cron/backfill/route.ts)) | A daily cron backfills up to 12 months of prices from Wayback Machine snapshots (skipping captcha captures by size, matching the product key, and passing every reading through the price guard), stored as `source: "archive"` sightings that count for all-time low/high but not for savings or tracked time. It also re-reads watched, untracked items weekly with the free fetcher only, so it never spends credits. |
| **Free by design** ([lib/scraper.ts](lib/scraper.ts), [lib/credit-budget.ts](lib/credit-budget.ts)) | A tiered reader: a free direct fetch plus structured data, then a 1-credit Firecrawl scrape only when a store blocks it (down from 5 credits for LLM JSON extraction), then free Nemotron. Comparisons only spend credits left over after reserving enough for every remaining daily check this billing period, so the free plan never runs out. No service has a card on file. |
| **Security** | The database is only reachable from the server. Every query in the data layer ([lib/data.ts](lib/data.ts), [app/actions](app/actions)) is scoped to the session's user, and an E2E test signs in as a second account to prove it can't see or export another user's data. Public pages select only whitelisted columns. Links to private addresses are refused, and adding products and AI calls have per-user daily quotas. Better Auth provides CSRF/origin checks, rejects off-site callback URLs, and stores rate-limit counters in Postgres so limits hold across serverless instances. Cron auth uses a constant-time comparison. Emails are rendered by React Email, so scraped text is escaped. CSV export neutralises formula injection. |
| **Correct maths** ([lib/insights.ts](lib/insights.ts)) | History stores only price *changes*, so it's a step function. Averages are **time-weighted**, window stats include the price in effect at the window start, unobserved gaps (over 8 silent days) are left out rather than assumed, and the trend is a least-squares slope over daily samples. |
| **Alert rules** ([lib/alerts.ts](lib/alerts.ts)) | A pure, prioritised rule engine: one notification per change, target alerts fire on crossing only (no daily spam), and out-of-stock prices are ignored. Push subscriptions the browser reports gone are removed. |
| **Type safety** | Strict TypeScript end to end: the Drizzle schema is the single source of truth for tables, migrations and row types. Zod validates every server action and the environment. CI fails if the schema changes without a migration. |
| **Testing** | 188 Vitest unit tests, including extractors run against saved real Amazon.in and Flipkart pages. Playwright E2E runs on **desktop Chrome, iPhone 13 (WebKit) and Pixel 7** against a real, freshly seeded Postgres, signing in through the actual magic-link flow. |
| **CI** | GitHub Actions: lint → typecheck → unit tests → migration drift check → build, then E2E against a Postgres service container. |
| **Infra** | Neon provisioned through the Vercel Marketplace. Functions are pinned to the database's region (Singapore), use `node-postgres` with a pool attached to Fluid compute, and migrations run on the direct (non-pooled) URL during each deploy. |

## Tech stack

Next.js 16 (App Router, Server Actions, ISR, `next/og`) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Recharts · Neon Postgres · Drizzle ORM · Better Auth · Firecrawl · Vercel AI SDK 7 (NVIDIA Nemotron / AI Gateway) · React Email + Nodemailer (Gmail) / Resend · web-push (VAPID) · Internet Archive · Zod · Vitest · Playwright · Vercel (Cron, Fluid Compute)

## Data model

Defined in [lib/db/schema.ts](lib/db/schema.ts), with SQL migrations generated into [drizzle/](drizzle) (plus hand-written migrations for triggers and data moves):

- `catalog_items`: one per real product (`key` = retailer ID), holding current/list price, stock, low/high (kept by a trigger), pending readings awaiting confirmation, check bookkeeping (`last_read_at`), the 90-day watch on untracked items (`watch_until`, set by a trigger) and archive backfill state
- `products`: a user tracking a catalog item, with their alert rules, collection and share link
- `price_history`: the shared, append-only history per catalog item, with the source of each reading (including `archive`) and `gap_from` when it follows an unobserved stretch
- `store_offers`: the same or similar product on other stores, from cross-store comparison
- `item_insights`: cached AI verdicts with the evidence they were based on
- `alerts`, `collections`, `user_settings`, `push_subscriptions` (one per device)
- `ai_usage` and `add_usage` (atomic daily quotas), `check_runs` (cron metrics)
- `user`, `session`, `account`, `verification`, `rate_limit`: Better Auth

Maintenance scripts (dry run by default, `-- --apply` to write): `npm run db:fix-outliers` removes history rows the price guard would reject, and `npm run db:rekey` resolves real product IDs and merges duplicates.

## Running locally

Requires Node 22+ and Docker.

```bash
git clone https://github.com/slokesh2905/tracklet.git
cd tracklet
npm install

npm run db:up        # Postgres 17 in Docker on :5433
cp .env.example .env.development.local
#   DATABASE_URL=postgres://tracklet:tracklet@localhost:5433/tracklet (same for _UNPOOLED)
#   BETTER_AUTH_SECRET=<random hex>
npm run db:seed      # migrate + demo data (refuses non-local databases)
npm run dev
```

Sign in as `demo@tracklet.dev`. With no email provider configured, the magic link is printed in the dev server console.

`.env.development.local` takes priority over `.env.local` during `next dev`, so local work never touches the production database that `vercel env pull` writes into `.env.local`.

To add real products you need a [Firecrawl](https://firecrawl.dev) key. Email (alerts and magic links) goes through Gmail with an [app password](https://myaccount.google.com/apppasswords), which is free with no domain needed, or through Resend if you have a verified domain. AI features use a free [NVIDIA API](https://build.nvidia.com) key (`NVIDIA_API_KEY`) or an AI Gateway key, and are hidden when neither is set. Web push needs free VAPID keys from `npx web-push generate-vapid-keys` and is hidden without them.

### Tests

```bash
npm test                 # unit tests
npm run test:e2e         # E2E on desktop + iPhone + Pixel (needs `npm run db:up`; reseeds the DB)
npm run lint && npm run typecheck
```

Trigger the crons locally:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/check-prices
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/backfill
```

`npm run ai:smoke` calls the real AI features against your configured provider, and `npm run email:dev` previews the email templates.

## Deploying

1. `vercel link`, then `vercel integration add neon` provisions Postgres and injects `DATABASE_URL` / `DATABASE_URL_UNPOOLED`.
2. Set `BETTER_AUTH_SECRET`, `CRON_SECRET`, `FIRECRAWL_API_KEY` and an email provider (`GMAIL_USER` + `GMAIL_APP_PASSWORD`, or `RESEND_API_KEY` + `RESEND_FROM_EMAIL`) with `vercel env add`. The app URL comes from Vercel's system variables.
3. Optional: create Google and GitHub OAuth apps with the callback `https://<your-domain>/api/auth/callback/{google|github}` and add their IDs and secrets; add `NVIDIA_API_KEY` for AI features; add `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` for web push.
4. `vercel deploy --prod`, or push to `main` with the Git integration. The build applies migrations, and the three crons in [vercel.ts](vercel.ts) (price check, history backfill, weekly digest) register automatically.

## Credits

Tracklet began as a price-tracker project by [Aman Tiwari](https://github.com/AmanTiwari404). This version is a ground-up rebuild by [Lokesh](https://github.com/slokesh2905) covering the TypeScript migration, schema and security model, pipeline, alerts, insights, AI features, sharing, redesign and test suite.

## License

[MIT](LICENSE)
