import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";

const TRACKING_PARAM =
  /^(utm_.*|fbclid|gclid|ref|ref_|tag|psc|smid|spm|_encoding|pd_rd_.*|pf_rd_.*)$/i;

/**
 * Canonicalise a product URL so the same page pasted twice (or by two users)
 * dedupes: drop the hash, tracking params and a trailing slash.
 */
export function normalizeProductUrl(input: string) {
  const url = new URL(input.trim());
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  }
  const text = url.toString();
  return text.endsWith("/") && url.pathname !== "/" && !url.search
    ? text.slice(0, -1)
    : text;
}

export const productUrlSchema = z
  .string()
  .trim()
  .min(1, "Paste a product URL")
  .max(2048, "That URL is too long")
  .pipe(z.url({ protocol: /^https?$/, message: "Enter a valid http(s) URL" }))
  .transform(normalizeProductUrl);

export const bulkUrlsSchema = z
  .string()
  .transform((text) => [
    ...new Set(
      text
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ])
  .pipe(
    z
      .array(productUrlSchema)
      .min(1, "Paste at least one URL")
      .max(20, "Up to 20 URLs at a time")
  );

const emptyToNull = (v: unknown) =>
  v === "" || v === null || v === undefined ? null : Number(v);

export const alertRulesSchema = z.object({
  productId: z.uuid(),
  targetPrice: z.preprocess(
    emptyToNull,
    z.number("Enter a number").positive("Must be above 0").max(1e9).nullable()
  ),
  alertPct: z.preprocess(
    emptyToNull,
    z.number("Enter a number").min(1, "At least 1%").max(90, "At most 90%").nullable()
  ),
});

export const settingsSchema = z.object({
  preferredCurrency: z.enum(SUPPORTED_CURRENCIES),
  emailAlerts: z.boolean(),
  weeklyDigest: z.boolean(),
  discordWebhookUrl: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z
      .string()
      .trim()
      .regex(
        /^https:\/\/(discord\.com|discordapp\.com|canary\.discord\.com)\/api\/webhooks\/\d+\/[\w-]+$/,
        "Must be a Discord webhook URL"
      )
      .nullable()
  ),
});

export const collectionNameSchema = z
  .string()
  .trim()
  .min(1, "Name your collection")
  .max(60, "Keep it under 60 characters");

export const uuidSchema = z.uuid();

export type SettingsInput = z.infer<typeof settingsSchema>;
export type AlertRulesInput = z.infer<typeof alertRulesSchema>;

/** First human-readable message from a Zod error. */
export function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid input";
}
