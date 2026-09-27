import "server-only";
import { createElement } from "react";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import MagicLinkEmail from "@/emails/MagicLinkEmail";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/notify";

function socialProviders() {
  const providers: Parameters<typeof betterAuth>[0]["socialProviders"] = {};
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
  }
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.github = {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    };
  }
  return providers;
}

export const auth = betterAuth({
  appName: "Tracklet",
  baseURL: env.NEXT_PUBLIC_APP_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      rateLimit: schema.rateLimit,
    },
  }),
  socialProviders: socialProviders(),
  // Counters live in Postgres so limits hold across serverless instances.
  rateLimit: { storage: "database" },
  session: {
    // Skip a DB round-trip on most requests; the signed cookie is re-checked every 5 min.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  plugins: [
    magicLink({
      expiresIn: 15 * 60,
      async sendMagicLink({ email, url }) {
        await sendEmail(email, "Your Tracklet sign-in link", createElement(MagicLinkEmail, { url }), {
          magicLink: url,
        });
      },
    }),
    // Must be last: lets server actions set auth cookies.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
