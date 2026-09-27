-- Move per-user product rows onto shared catalog items.
-- Keys start as "url:<url>"; `npm run db:rekey` later resolves real retailer ids
-- (Amazon ASIN, Flipkart pid, ...) and merges items that turn out to be the same product.

INSERT INTO catalog_items (
  key, retailer, url, name, image_url, category, current_price, original_price, currency, in_stock,
  lowest_price, highest_price, last_checked_at, last_error, fail_count, paused, created_at
)
SELECT DISTINCT ON (p.url)
  'url:' || p.url,
  coalesce(substring(p.url from '://(?:www\.|m\.|dl\.)?([^./]+)'), 'web'),
  p.url, p.name, p.image_url, p.category, p.current_price, p.original_price, p.currency, p.in_stock,
  p.lowest_price, p.highest_price, p.last_checked_at, p.last_error, p.fail_count, p.paused, p.created_at
FROM products p
ORDER BY p.url, p.created_at;
--> statement-breakpoint
UPDATE products p SET catalog_item_id = c.id FROM catalog_items c WHERE c.key = 'url:' || p.url;
--> statement-breakpoint
UPDATE price_history h SET catalog_item_id = p.catalog_item_id, source = 'import'
FROM products p WHERE p.id = h.product_id;
--> statement-breakpoint
-- Price extremes now live on catalog_items.
DROP TRIGGER IF EXISTS price_history_extremes ON price_history;
--> statement-breakpoint
DROP FUNCTION IF EXISTS track_price_extremes();
--> statement-breakpoint
CREATE FUNCTION track_item_price_extremes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE catalog_items
     SET lowest_price  = least(coalesce(lowest_price, NEW.price), NEW.price),
         highest_price = greatest(coalesce(highest_price, NEW.price), NEW.price)
   WHERE id = NEW.catalog_item_id;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER price_history_item_extremes AFTER INSERT ON price_history
  FOR EACH ROW EXECUTE FUNCTION track_item_price_extremes();
--> statement-breakpoint
CREATE TRIGGER catalog_items_touch BEFORE UPDATE ON catalog_items
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
