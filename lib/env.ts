import { z } from "zod";

// Public vars are inlined at build time, so they must be referenced literally.
export const env = z
  .object({
    NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  })
  .parse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
  });

const serverSchema = z.object({
  FIRECRAWL_API_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().min(3),
  CRON_SECRET: z.string().min(16),
  AI_MODEL: z.string().default("anthropic/claude-haiku-4.5"),
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
