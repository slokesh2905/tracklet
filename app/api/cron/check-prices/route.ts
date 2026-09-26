import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { serverEnv } from "@/lib/env";
import { runPriceCheck } from "@/lib/pipeline";
import { createSupabasePipelineStore } from "@/lib/pipeline-store";
import { createFirecrawlScraper } from "@/lib/scraper";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const started = Date.now();
  const { data: run } = await supabase
    .from("check_runs")
    .insert({})
    .select("id")
    .single();

  try {
    const summary = await runPriceCheck(
      createFirecrawlScraper(serverEnv("FIRECRAWL_API_KEY")),
      createSupabasePipelineStore(supabase),
      // Leave headroom under maxDuration for in-flight scrapes to finish.
      { budgetMs: 240_000 }
    );

    if (run) {
      await supabase
        .from("check_runs")
        .update({
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - started,
          products_checked: summary.productsChecked,
          urls_scraped: summary.urlsScraped,
          price_changes: summary.priceChanges,
          alerts_sent: summary.alertsSent,
          failures: summary.failures,
        })
        .eq("id", run.id);
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
