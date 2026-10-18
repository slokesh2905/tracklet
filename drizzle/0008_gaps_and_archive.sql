ALTER TABLE "catalog_items" ADD COLUMN "last_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "watch_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "price_history" ADD COLUMN "gap_from" timestamp with time zone;--> statement-breakpoint
-- An item without a pending error was last read when it was last checked; otherwise the last
-- reading we can prove is its newest history row.
UPDATE catalog_items c SET last_read_at = CASE
  WHEN c.last_error IS NULL THEN c.last_checked_at
  ELSE (SELECT max(h.checked_at) FROM price_history h WHERE h.catalog_item_id = c.id)
END;--> statement-breakpoint
-- When the last tracker of an item goes (untracked, or the account was deleted), keep a free
-- weekly check on it for a while so the next person to track it finds a recent history.
CREATE FUNCTION watch_untracked_item() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE catalog_items
     SET watch_until = now() + interval '90 days'
   WHERE id = OLD.catalog_item_id
     AND NOT EXISTS (SELECT 1 FROM products WHERE catalog_item_id = OLD.catalog_item_id);
  RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER products_watch_untracked AFTER DELETE ON products
  FOR EACH ROW EXECUTE FUNCTION watch_untracked_item();
