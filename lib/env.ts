import { z } from "zod";

/**
 * The app's public origin. An explicit NEXT_PUBLIC_APP_URL wins; on Vercel it
 * falls back to the system variables: the production domain for production,
 * and the deployment's own URL for previews (so preview auth stays on preview).
 */
function appUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const host =
    process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_URL;
  return host ? `https://${host}` : undefined;
}

export const env = z
  .object({
    NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  })
  .parse({
    NEXT_PUBLIC_APP_URL: appUrl(),
  });

const serverSchema = z.object({
  CRON_SECRET: z.string().min(16),
  AI_DAILY_LIMIT: z.coerce.number().int().positive().default(20),
});

type ServerEnv = z.infer<typeof serverSchema>;

/**
 * Read one server-only variable, failing loudly with its name when it is missing.
 * Validated per key so a missing email key doesn't take down unrelated features.
 */
export function serverEnv<K extends keyof ServerEnv>(key: K): ServerEnv[K] {
  if (typeof window !== "undefined") {
    throw new Error(`serverEnv("${key}") called in the browser`);
  }
  const result = serverSchema.shape[key].safeParse(process.env[key] || undefined);
  if (!result.success) {
    throw new Error(`Missing or invalid environment variable ${key}`);
  }
  return result.data as ServerEnv[K];
}
