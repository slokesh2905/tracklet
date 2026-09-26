import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    // Daily price check (Hobby plan allows one run per day per cron).
    { path: "/api/cron/check-prices", schedule: "0 6 * * *" },
    // Weekly digest, Monday morning UTC.
    { path: "/api/cron/weekly-digest", schedule: "0 8 * * 1" },
  ],
};
