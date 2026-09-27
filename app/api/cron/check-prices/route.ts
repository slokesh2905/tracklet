import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { checkRuns } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { runPriceCheck } from "@/lib/pipeline";
import { createDbPipelineStore } from "@/lib/pipeline-store";
import { createFirecrawlScraper } from "@/lib/scraper";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const [run] = await db.insert(checkRuns).values({}).returning({ id: checkRuns.id });

  try {
    const summary = await runPriceCheck(
      createFirecrawlScraper(serverEnv("FIRECRAWL_API_KEY")),
      createDbPipelineStore(),
      // Leave headroom under maxDuration for in-flight scrapes to finish.
      { budgetMs: 240_000 }
    );

    if (run) {
      await db
        .update(checkRuns)
        .set({
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - started,
          products_checked: summary.productsChecked,
          urls_scraped: summary.urlsScraped,
          price_changes: summary.priceChanges,
          alerts_sent: summary.alertsSent,
          failures: summary.failures,
        })
        .where(eq(checkRuns.id, run.id));
    }

    return NextResponse.json({ ok: true, durationMs: Date.now() - started, ...summary });
  } catch (error) {
    console.error("Price check failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
