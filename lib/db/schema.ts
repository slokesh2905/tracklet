import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * timestamptz that surfaces as an ISO-8601 string. Postgres' own text format
 * ("2026-09-27 04:30:00+00") is not reliably parsed by Safari, and plain
 * strings serialise cleanly from Server Components to the client.
 */
const isoTimestamp = customType<{ data: string; driverData: string | Date }>({
  dataType() {
    return "timestamp with time zone";
  },
  fromDriver(value) {
    return new Date(value).toISOString();
  },
  toDriver(value) {
    return value;
  },
});

const createdAt = () => isoTimestamp("created_at").notNull().default(sql`now()`);
const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: "number" });
const shareSlug = () =>
  text("share_slug")
    .notNull()
    .unique()
    .default(sql`substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)`);

// ---------------------------------------------------------------------------
// Better Auth tables (field names are Better Auth's; columns are snake_case)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)]
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)]
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)]
);

/** Shared rate-limit counters, so limits hold across serverless instances. */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// ---------------------------------------------------------------------------
// Tracklet tables
// ---------------------------------------------------------------------------

export type AlertKind = "target_reached" | "price_drop" | "all_time_low" | "back_in_stock";
export type Verdict = "buy_now" | "wait" | "fair";

export const collections = pgTable(
  "collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    is_public: boolean("is_public").notNull().default(false),
    share_slug: shareSlug(),
    created_at: createdAt(),
  },
  (t) => [
    index("collections_user_idx").on(t.user_id),
    check("collections_name_len", sql`char_length(${t.name}) between 1 and 60`),
  ]
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    name: text("name").notNull(),
    current_price: money("current_price").notNull(),
    original_price: money("original_price"),
    currency: text("currency").notNull().default("USD"),
    image_url: text("image_url"),
    in_stock: boolean("in_stock").notNull().default(true),
    category: text("category"),
    collection_id: uuid("collection_id").references(() => collections.id, { onDelete: "set null" }),
    // Alert rules: fire when price <= target_price, or drops by >= alert_pct in one check.
    target_price: money("target_price"),
    alert_pct: numeric("alert_pct", { precision: 5, scale: 2, mode: "number" }),
    // Denormalised from price_history by trigger so cards need no aggregate query.
    lowest_price: money("lowest_price"),
    highest_price: money("highest_price"),
    is_public: boolean("is_public").notNull().default(false),
    share_slug: shareSlug(),
    // Pipeline bookkeeping.
    last_checked_at: isoTimestamp("last_checked_at"),
    last_error: text("last_error"),
    fail_count: integer("fail_count").notNull().default(0),
    paused: boolean("paused").notNull().default(false),
    created_at: createdAt(),
    updated_at: isoTimestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => [
    unique("products_user_url_key").on(t.user_id, t.url),
    index("products_user_idx").on(t.user_id, t.created_at.desc()),
    index("products_stalest_idx").on(t.last_checked_at.asc().nullsFirst()).where(sql`not ${t.paused}`),
    index("products_url_idx").on(t.url),
    index("products_collection_idx").on(t.collection_id),
    check("products_price_nonneg", sql`${t.current_price} >= 0`),
    check("products_target_positive", sql`${t.target_price} > 0`),
    check("products_alert_pct_range", sql`${t.alert_pct} > 0 and ${t.alert_pct} < 100`),
  ]
);

export const priceHistory = pgTable(
  "price_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    product_id: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    price: money("price").notNull(),
    currency: text("currency").notNull(),
    in_stock: boolean("in_stock"),
    checked_at: isoTimestamp("checked_at").notNull().default(sql`now()`),
  },
  (t) => [
    index("price_history_product_checked_idx").on(t.product_id, t.checked_at),
    check("price_history_price_nonneg", sql`${t.price} >= 0`),
  ]
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    product_id: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    kind: text("kind").$type<AlertKind>().notNull(),
    old_price: money("old_price"),
    new_price: money("new_price").notNull(),
    currency: text("currency").notNull(),
    channels: text("channels").array().notNull().default(sql`'{}'::text[]`),
    read_at: isoTimestamp("read_at"),
    created_at: createdAt(),
  },
  (t) => [
    index("alerts_user_created_idx").on(t.user_id, t.created_at.desc()),
    index("alerts_product_idx").on(t.product_id),
    check("alerts_kind", sql`${t.kind} in ('target_reached', 'price_drop', 'all_time_low', 'back_in_stock')`),
  ]
);

export const userSettings = pgTable(
  "user_settings",
  {
    user_id: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    preferred_currency: text("preferred_currency").notNull().default("USD"),
    email_alerts: boolean("email_alerts").notNull().default(true),
    weekly_digest: boolean("weekly_digest").notNull().default(true),
    discord_webhook_url: text("discord_webhook_url"),
    updated_at: isoTimestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => [
    check("user_settings_currency", sql`${t.preferred_currency} ~ '^[A-Z]{3}$'`),
    check(
      "user_settings_discord",
      sql`${t.discord_webhook_url} is null or ${t.discord_webhook_url} ~ '^https://(discord\\.com|discordapp\\.com|canary\\.discord\\.com)/api/webhooks/'`
    ),
  ]
);

export const productInsights = pgTable(
  "product_insights",
  {
    product_id: uuid("product_id")
      .primaryKey()
      .references(() => products.id, { onDelete: "cascade" }),
    verdict: text("verdict").$type<Verdict>().notNull(),
    confidence: numeric("confidence", { precision: 3, scale: 2, mode: "number" }).notNull(),
    summary: text("summary").notNull(),
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    price_at_generation: money("price_at_generation").notNull(),
    model: text("model").notNull(),
    generated_at: isoTimestamp("generated_at").notNull().default(sql`now()`),
  },
  (t) => [
    check("product_insights_verdict", sql`${t.verdict} in ('buy_now', 'wait', 'fair')`),
    check("product_insights_confidence", sql`${t.confidence} between 0 and 1`),
  ]
);

/** Per-user daily AI call counter (see consumeAiQuota). */
export const aiUsage = pgTable(
  "ai_usage",
  {
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: date("day").notNull().default(sql`current_date`),
    calls: integer("calls").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.day] })]
);

/** Cron observability. */
export const checkRuns = pgTable("check_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  started_at: isoTimestamp("started_at").notNull().default(sql`now()`),
  finished_at: isoTimestamp("finished_at"),
  products_checked: integer("products_checked").notNull().default(0),
  urls_scraped: integer("urls_scraped").notNull().default(0),
  price_changes: integer("price_changes").notNull().default(0),
  alerts_sent: integer("alerts_sent").notNull().default(0),
  failures: integer("failures").notNull().default(0),
  duration_ms: integer("duration_ms"),
});

// ---------------------------------------------------------------------------
// Relations (for the relational query API)
// ---------------------------------------------------------------------------

export const productsRelations = relations(products, ({ one, many }) => ({
  collection: one(collections, { fields: [products.collection_id], references: [collections.id] }),
  priceHistory: many(priceHistory),
  alerts: many(alerts),
  insight: one(productInsights, { fields: [products.id], references: [productInsights.product_id] }),
}));

export const collectionsRelations = relations(collections, ({ many }) => ({
  products: many(products),
}));

export const priceHistoryRelations = relations(priceHistory, ({ one }) => ({
  product: one(products, { fields: [priceHistory.product_id], references: [products.id] }),
}));

export const alertsRelations = relations(alerts, ({ one }) => ({
  product: one(products, { fields: [alerts.product_id], references: [products.id] }),
}));

export const productInsightsRelations = relations(productInsights, ({ one }) => ({
  product: one(products, { fields: [productInsights.product_id], references: [products.id] }),
}));

// ---------------------------------------------------------------------------
// Row types used across the app
// ---------------------------------------------------------------------------

export type CollectionRow = typeof collections.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
export type PriceHistoryRow = typeof priceHistory.$inferSelect;
export type AlertRow = typeof alerts.$inferSelect;
export type UserSettingsRow = typeof userSettings.$inferSelect;
export type ProductInsightRow = typeof productInsights.$inferSelect;
export type CheckRunRow = typeof checkRuns.$inferSelect;
