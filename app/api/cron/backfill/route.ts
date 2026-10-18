import { NextResponse } from "next/server";
import { backfillFromArchive, itemsAwaitingArchive } from "@/lib/archive";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runWatchCheck } from "@/lib/pipeline";
import { createDbPipelineStore } from "@/lib/pipeline-store";
import { createScraper } from "@/lib/scraper";

export const maxDuration = 300;

/** Archive backfills started per run (each takes up to a minute of polite, rate-limited requests). */
const ARCHIVE_ITEMS_PER_RUN = 3;

/**
 * Daily, free history upkeep, separate from the price check so it never eats into its time:
 *   1. a weekly re-read of untracked items still being watched (direct fetch only: no credits);
 *   2. a one-time Internet Archive backfill for items that haven't had one.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  try {
    // No Firecrawl key and no LLM: a store that blocks direct fetches is just skipped this week.
    const watch = await runWatchCheck(createScraper(), createDbPipelineStore(), { budgetMs: 90_000 });

    let archived = 0;
    let archiveItems = 0;
    for (const id of await itemsAwaitingArchive(ARCHIVE_ITEMS_PER_RUN)) {
      // One backfill can overrun its budget by an in-flight request (~95s worst case): stop early enough.
      if (Date.now() - started > 180_000) break;
      archived += await backfillFromArchive(id, { budgetMs: 60_000 });
      archiveItems++;
    }

    return NextResponse.json({ ok: true, durationMs: Date.now() - started, watch, archiveItems, archived });
  } catch (error) {
    console.error("Backfill failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
