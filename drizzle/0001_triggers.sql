-- Keep updated_at current on every UPDATE.
CREATE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER products_touch BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER user_settings_touch BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
-- Keep products.lowest_price / highest_price in sync with price history, so the
-- dashboard never needs an aggregate query and alerts see the previous low.
CREATE FUNCTION track_price_extremes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE products
     SET lowest_price  = least(coalesce(lowest_price, NEW.price), NEW.price),
         highest_price = greatest(coalesce(highest_price, NEW.price), NEW.price)
   WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER price_history_extremes AFTER INSERT ON price_history
  FOR EACH ROW EXECUTE FUNCTION track_price_extremes();
