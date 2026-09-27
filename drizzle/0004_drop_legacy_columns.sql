ALTER TABLE "product_insights" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "product_insights" CASCADE;--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_user_url_key";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_price_nonneg";--> statement-breakpoint
ALTER TABLE "price_history" DROP CONSTRAINT "price_history_product_id_products_id_fk";
--> statement-breakpoint
DROP INDEX "price_history_product_checked_idx";--> statement-breakpoint
DROP INDEX "products_stalest_idx";--> statement-breakpoint
DROP INDEX "products_url_idx";--> statement-breakpoint
ALTER TABLE "price_history" ALTER COLUMN "catalog_item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "catalog_item_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "price_history_item_checked_idx" ON "price_history" USING btree ("catalog_item_id","checked_at");--> statement-breakpoint
CREATE INDEX "products_item_idx" ON "products" USING btree ("catalog_item_id");--> statement-breakpoint
ALTER TABLE "price_history" DROP COLUMN "product_id";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "url";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "current_price";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "original_price";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "currency";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "image_url";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "in_stock";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "category";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "lowest_price";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "highest_price";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "last_checked_at";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "last_error";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "fail_count";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "paused";--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_user_item_key" UNIQUE("user_id","catalog_item_id");