ALTER TABLE "check_runs" ADD COLUMN "held" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "check_runs" ADD COLUMN "rejected" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "check_runs" ADD COLUMN "firecrawl_fetches" integer DEFAULT 0 NOT NULL;