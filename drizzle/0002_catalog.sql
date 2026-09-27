CREATE TABLE "catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"retailer" text NOT NULL,
	"url" text NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"category" text,
	"current_price" numeric(12, 2) NOT NULL,
	"original_price" numeric(12, 2),
	"currency" text DEFAULT 'INR' NOT NULL,
	"in_stock" boolean DEFAULT true NOT NULL,
	"lowest_price" numeric(12, 2),
	"highest_price" numeric(12, 2),
	"pending_price" numeric(12, 2),
	"pending_since" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"fail_count" integer DEFAULT 0 NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"compared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_items_key_unique" UNIQUE("key"),
	CONSTRAINT "catalog_items_price_nonneg" CHECK ("catalog_items"."current_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "item_insights" (
	"catalog_item_id" uuid PRIMARY KEY NOT NULL,
	"verdict" text NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"summary" text NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_at_generation" numeric(12, 2) NOT NULL,
	"model" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_insights_verdict" CHECK ("item_insights"."verdict" in ('buy_now', 'wait', 'fair', 'buy_elsewhere')),
	CONSTRAINT "item_insights_confidence" CHECK ("item_insights"."confidence" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "store_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"retailer" text NOT NULL,
	"url" text NOT NULL,
	"name" text NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"in_stock" boolean DEFAULT true NOT NULL,
	"match" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_offers_item_url_key" UNIQUE("catalog_item_id","url"),
	CONSTRAINT "store_offers_match" CHECK ("store_offers"."match" in ('exact', 'similar'))
);
--> statement-breakpoint
ALTER TABLE "price_history" ADD COLUMN "catalog_item_id" uuid;--> statement-breakpoint
ALTER TABLE "price_history" ADD COLUMN "source" text DEFAULT 'check' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "catalog_item_id" uuid;--> statement-breakpoint
ALTER TABLE "item_insights" ADD CONSTRAINT "item_insights_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_offers" ADD CONSTRAINT "store_offers_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_items_stalest_idx" ON "catalog_items" USING btree ("last_checked_at" NULLS FIRST) WHERE not "catalog_items"."paused";--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;