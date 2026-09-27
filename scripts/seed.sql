-- Local development / E2E seed (never run against production). Applied by `npm run db:seed`.
-- Demo login: demo@tracklet.dev via magic link (printed to the dev server console).

do $$
declare
  demo text := 'demo-user-0001';
  office uuid := '00000000-0000-4000-b000-000000000001';
  gifts uuid := '00000000-0000-4000-b000-000000000002';
begin
  insert into "user" (id, name, email, email_verified, created_at, updated_at)
  values (demo, 'Demo Shopper', 'demo@tracklet.dev', true, now() - interval '130 days', now());

  insert into user_settings (user_id, preferred_currency) values (demo, 'INR');

  insert into collections (id, user_id, name, is_public, share_slug) values
    (office, demo, 'Home office', true, 'bbbbbbbbbbb1'),
    (gifts, demo, 'Gift ideas', false, 'bbbbbbbbbbb2');
end $$;

-- Helper: create a product with a (days_ago, price) history. Current price = last point.
create function pg_temp.seed_product(
  p_name text, p_url text, p_currency text, p_points numeric[][],
  p_target numeric default null, p_collection uuid default null,
  p_in_stock boolean default true, p_original numeric default null,
  p_public boolean default false, p_slug text default null, p_category text default null
) returns uuid language plpgsql as $$
declare
  demo text := 'demo-user-0001';
  pid uuid;
  i int;
  n int := array_length(p_points, 1);
begin
  insert into products (
    user_id, url, name, current_price, original_price, currency, in_stock, target_price,
    collection_id, is_public, share_slug, category, created_at, last_checked_at
  ) values (
    demo, p_url, p_name, p_points[n][2], p_original, p_currency, p_in_stock, p_target,
    p_collection, p_public, coalesce(p_slug, substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
    p_category, now() - make_interval(days => p_points[1][1]::int), now() - interval '5 hours'
  ) returning id into pid;

  for i in 1..n loop
    insert into price_history (product_id, price, currency, in_stock, checked_at)
    values (pid, p_points[i][2], p_currency, case when i = n then p_in_stock else true end,
            now() - make_interval(days => p_points[i][1]::int));
  end loop;
  return pid;
end $$;

do $$
declare
  demo text := 'demo-user-0001';
  office uuid := '00000000-0000-4000-b000-000000000001';
  gifts uuid := '00000000-0000-4000-b000-000000000002';
  sony uuid; dyson uuid; airpods uuid;
begin
  sony := pg_temp.seed_product(
    'Sony WH-1000XM5 Wireless Noise Cancelling Headphones', 'https://www.amazon.in/dp/B0BYS4SRJ7', 'INR',
    array[[120, 29990], [107, 27990], [94, 28490], [81, 26990], [68, 27490], [55, 25990], [42, 26490], [29, 24990], [3, 23490]],
    p_target => 24000, p_collection => gifts, p_original => 34990, p_public => true, p_slug => 'aaaaaaaaaaa1',
    p_category => 'Electronics');

  airpods := pg_temp.seed_product(
    'Apple AirPods Pro (2nd generation) with MagSafe Case (USB-C)', 'https://www.bestbuy.com/site/apple-airpods-pro-2/6447382.p', 'USD',
    array[[90, 249.99], [60, 199.99], [35, 229.99], [10, 189.99]],
    p_collection => gifts, p_category => 'Electronics');

  perform pg_temp.seed_product(
    'Kindle Paperwhite (16 GB) – 7" display, adjustable warm light', 'https://www.amazon.com/dp/B0CFPJYX7P', 'USD',
    array[[75, 149.99], [40, 159.99]],
    p_target => 125, p_collection => office, p_category => 'Electronics');

  perform pg_temp.seed_product(
    'Nike Pegasus 41 Men''s Road Running Shoes', 'https://www.myntra.com/sports-shoes/nike/pegasus-41/29107342', 'INR',
    array[[21, 11895]], p_category => 'Sports & Outdoors');

  dyson := pg_temp.seed_product(
    'Dyson V12 Detect Slim Cordless Vacuum Cleaner', 'https://www.flipkart.com/dyson-v12-detect-slim/p/itm1b7a1', 'INR',
    array[[110, 52900], [80, 49900], [50, 47900], [20, 46900], [2, 44900]],
    p_original => 58900, p_category => 'Home & Kitchen');

  perform pg_temp.seed_product(
    'Instant Pot Duo 7-in-1 Electric Pressure Cooker, 6 Quart', 'https://www.walmart.com/ip/Instant-Pot-Duo/65386694', 'USD',
    array[[64, 89.99], [30, 79.95], [6, 79.95]],
    p_in_stock => false, p_category => 'Home & Kitchen');

  perform pg_temp.seed_product(
    'Logitech MX Master 3S Performance Wireless Mouse', 'https://www.logitech.com/en-us/products/mice/mx-master-3s.html', 'USD',
    array[[0, 99.99]], p_collection => office, p_category => 'Computers');

  insert into alerts (user_id, product_id, kind, old_price, new_price, currency, channels, created_at) values
    (demo, sony, 'target_reached', 24990, 23490, 'INR', '{email,discord}', now() - interval '3 days'),
    (demo, dyson, 'all_time_low', 46900, 44900, 'INR', '{email}', now() - interval '2 days'),
    (demo, airpods, 'price_drop', 229.99, 189.99, 'USD', '{email}', now() - interval '10 days');

  update alerts set read_at = now() where kind = 'price_drop';
end $$;
