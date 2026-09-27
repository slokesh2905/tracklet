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

- **Track any store.** Paste a link (or 20 at once). Firecrawl extracts name, price, currency, stock and list price, with an LLM fallback when structured extraction fails.
- **Smart alerts.** Set a target price or a minimum % drop. You're alerted when the price *crosses* the target, when it hits a new all-time low, or when an item is back in stock. Delivery by email (React Email + Resend) and Discord webhook, plus a weekly digest.
- **Honest price insights.** Step-function charts with 7D/30D/90D/All ranges, time-weighted averages, 30/90-day ranges, a regression trend, and a **0–100 deal score**.
- **AI "buy now or wait?" verdict.** Structured output from the Vercel AI SDK, grounded only in computed statistics, cached per price and rate-limited per user in Postgres.
- **Collections & sharing.** Group products into wishlists. Public product and collection pages are cached with ISR and get generated Open Graph images.
- **Multi-currency.** Totals convert into your preferred currency using daily ECB rates.
- **Mobile-first PWA.** Installable, with a bottom tab bar, bottom-sheet dialogs, 44px touch targets and safe-area insets. E2E tests fail on horizontal overflow at every viewport.
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
  P --> E[Resend email]
  P --> D[Discord webhook]
  A[Anonymous visitor] -->|whitelisted share queries| N
```

### Engineering highlights

| Area | What was done |
| --- | --- |
| **Scalable pipeline** ([lib/pipeline.ts](lib/pipeline.ts)) | Picks the stalest products first. Each **distinct URL is scraped once per run** and the result fans out to every user tracking it. Bounded concurrency, exponential-backoff retries, a time budget under the function limit, and auto-pause after 5 consecutive failures. Each run is logged to `check_runs`. Scrapes are also reused across users within a 6-hour window when someone adds a product. |
| **Security** | The database is only reachable from the server. Every query in the data layer ([lib/data.ts](lib/data.ts), [app/actions](app/actions)) is scoped to the session's user, and an E2E test signs in as a second account to prove it can't see or export another user's data. Public pages select only whitelisted columns. Better Auth provides CSRF/origin checks, rejects off-site callback URLs, and stores rate-limit counters in Postgres so limits hold across serverless instances. Cron auth uses a constant-time comparison. Emails are rendered by React Email, so scraped text is escaped. CSV export neutralises formula injection. |
| **Correct maths** ([lib/insights.ts](lib/insights.ts)) | History stores only price *changes*, so it's a step function. Averages are **time-weighted**, window stats include the price in effect at the window start, and the trend is a least-squares slope over daily samples. |
| **Alert rules** ([lib/alerts.ts](lib/alerts.ts)) | A pure, prioritised rule engine: one notification per change, target alerts fire on crossing only (no daily spam), and out-of-stock prices are ignored. |
| **Type safety** | Strict TypeScript end to end: the Drizzle schema is the single source of truth for tables, migrations and row types. Zod validates every server action and the environment. CI fails if the schema changes without a migration. |
| **Testing** | 55 Vitest unit tests. Playwright E2E runs on **desktop Chrome, iPhone 13 (WebKit) and Pixel 7** against a real, freshly seeded Postgres, signing in through the actual magic-link flow. |
| **CI** | GitHub Actions: lint → typecheck → unit tests → migration drift check → build, then E2E against a Postgres service container. |
| **Infra** | Neon provisioned through the Vercel Marketplace. Functions are pinned to the database's region (Singapore), use `node-postgres` with a pool attached to Fluid compute, and migrations run on the direct (non-pooled) URL during each deploy. |

## Tech stack

Next.js 16 (App Router, Server Actions, ISR, `next/og`) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Recharts · Neon Postgres · Drizzle ORM · Better Auth · Firecrawl · Vercel AI SDK 7 + AI Gateway · Resend + React Email · Zod · Vitest · Playwright · Vercel (Cron, Fluid Compute)

## Data model

Defined in [lib/db/schema.ts](lib/db/schema.ts), with SQL migrations generated into [drizzle/](drizzle) (plus a hand-written migration for triggers):

- `products`: one row per user × URL, plus alert rules, denormalised low/high (kept in sync by a trigger), pipeline bookkeeping and a share slug
- `price_history`: append-only; a row is written only when price or stock changes
- `alerts`: log of every alert sent and the channels it reached
- `collections`, `user_settings`, `product_insights` (cached AI verdicts), `ai_usage` (atomic daily quota), `check_runs` (cron log)
- `user`, `session`, `account`, `verification`, `rate_limit`: Better Auth

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

Sign in as `demo@tracklet.dev`. Without a Resend key, the magic link is printed in the dev server console.

`.env.development.local` takes priority over `.env.local` during `next dev`, so local work never touches the production database that `vercel env pull` writes into `.env.local`.

To add real products you need a [Firecrawl](https://firecrawl.dev) key. Email alerts need a [Resend](https://resend.com) key. AI features need an [AI Gateway](https://vercel.com/ai-gateway) key locally; on Vercel they use OIDC automatically.

### Tests

```bash
npm test                 # unit tests
npm run test:e2e         # E2E on desktop + iPhone + Pixel (needs `npm run db:up`; reseeds the DB)
npm run lint && npm run typecheck
```

Trigger a price check locally:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/check-prices
```

## Deploying

1. `vercel link`, then `vercel integration add neon` provisions Postgres and injects `DATABASE_URL` / `DATABASE_URL_UNPOOLED`.
2. Set `BETTER_AUTH_SECRET`, `CRON_SECRET`, `FIRECRAWL_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and `NEXT_PUBLIC_APP_URL` with `vercel env add`.
3. Optional: create Google and GitHub OAuth apps with the callback `https://<your-domain>/api/auth/callback/{google|github}` and add their IDs and secrets.
4. `vercel deploy --prod`. The build applies migrations, and the crons in [vercel.ts](vercel.ts) register automatically.

## Credits

Tracklet began as a price-tracker project by [Aman Tiwari](https://github.com/AmanTiwari404). This version is a ground-up rebuild by [Lokesh](https://github.com/slokesh2905) covering the TypeScript migration, schema and security model, pipeline, alerts, insights, AI features, sharing, redesign and test suite.

## License

[MIT](LICENSE)
