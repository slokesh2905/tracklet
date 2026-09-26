-- Tracklet schema: products, price history, alerts, collections, settings, AI cache, cron runs.
-- Every user-owned table is protected by RLS keyed on auth.uid(). Anonymous visitors never
-- touch tables directly; public share pages go through security-definer functions that
-- return only whitelisted columns.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.collections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  is_public   boolean not null default false,
  share_slug  text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  created_at  timestamptz not null default now()
);

create table public.products (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url              text not null,
  name             text not null,
  current_price    numeric(12, 2) not null check (current_price >= 0),
  original_price   numeric(12, 2),
  currency         text not null default 'USD',
  image_url        text,
  in_stock         boolean not null default true,
  category         text,
  collection_id    uuid references public.collections (id) on delete set null,
  -- Alert rules: fire when price <= target_price, or drops by >= alert_pct in one check.
  target_price     numeric(12, 2) check (target_price > 0),
  alert_pct        numeric(5, 2) check (alert_pct > 0 and alert_pct < 100),
  -- Denormalised from price_history by trigger so cards need no aggregate query.
  lowest_price     numeric(12, 2),
  highest_price    numeric(12, 2),
  is_public        boolean not null default false,
  share_slug       text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  -- Pipeline bookkeeping.
  last_checked_at  timestamptz,
  last_error       text,
  fail_count       integer not null default 0,
  paused           boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, url)
);

create table public.price_history (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  price       numeric(12, 2) not null check (price >= 0),
  currency    text not null,
  in_stock    boolean,
  checked_at  timestamptz not null default now()
);

create table public.alerts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete cascade,
  kind        text not null check (kind in ('target_reached', 'price_drop', 'all_time_low', 'back_in_stock')),
  old_price   numeric(12, 2),
  new_price   numeric(12, 2) not null,
  currency    text not null,
  channels    text[] not null default '{}',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table public.user_settings (
  user_id              uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  preferred_currency   text not null default 'USD' check (preferred_currency ~ '^[A-Z]{3}$'),
  email_alerts         boolean not null default true,
  weekly_digest        boolean not null default true,
  discord_webhook_url  text check (
    discord_webhook_url is null
    or discord_webhook_url ~ '^https://(discord\.com|discordapp\.com|canary\.discord\.com)/api/webhooks/'
  ),
  updated_at           timestamptz not null default now()
);

create table public.product_insights (
  product_id           uuid primary key references public.products (id) on delete cascade,
  verdict              text not null check (verdict in ('buy_now', 'wait', 'fair')),
  confidence           numeric(3, 2) not null check (confidence between 0 and 1),
  summary              text not null,
  reasons              jsonb not null default '[]',
  price_at_generation  numeric(12, 2) not null,
  model                text not null,
  generated_at         timestamptz not null default now()
);

-- Per-user daily AI call counter; only writable through consume_ai_quota().
create table public.ai_usage (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null default current_date,
  calls    integer not null default 0,
  primary key (user_id, day)
);

-- Cron observability; service role only.
create table public.check_runs (
  id                uuid primary key default gen_random_uuid(),
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  products_checked  integer not null default 0,
  urls_scraped      integer not null default 0,
  price_changes     integer not null default 0,
  alerts_sent       integer not null default 0,
  failures          integer not null default 0,
  duration_ms       integer
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index price_history_product_checked_idx on public.price_history (product_id, checked_at);
create index products_user_idx on public.products (user_id, created_at desc);
create index products_stalest_idx on public.products (last_checked_at nulls first) where not paused;
create index products_url_idx on public.products (url);
create index products_collection_idx on public.products (collection_id);
create index alerts_user_created_idx on public.alerts (user_id, created_at desc);
create index alerts_product_idx on public.alerts (product_id);
create index collections_user_idx on public.collections (user_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();
create trigger user_settings_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- Keep products.lowest_price / highest_price in sync with history.
create function public.track_price_extremes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.products
     set lowest_price  = least(coalesce(lowest_price, new.price), new.price),
         highest_price = greatest(coalesce(highest_price, new.price), new.price)
   where id = new.product_id;
  return new;
end;
$$;

create trigger price_history_extremes after insert on public.price_history
  for each row execute function public.track_price_extremes();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.collections      enable row level security;
alter table public.products         enable row level security;
alter table public.price_history    enable row level security;
alter table public.alerts           enable row level security;
alter table public.user_settings    enable row level security;
alter table public.product_insights enable row level security;
alter table public.ai_usage         enable row level security;
alter table public.check_runs       enable row level security;

create policy "own collections" on public.collections
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own products" on public.products
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (collection_id is null or exists (
      select 1 from public.collections c
       where c.id = collection_id and c.user_id = (select auth.uid())
    ))
  );

create policy "history of own products" on public.price_history
  for select to authenticated
  using (exists (
    select 1 from public.products p
     where p.id = product_id and p.user_id = (select auth.uid())
  ));

create policy "insert history for own products" on public.price_history
  for insert to authenticated
  with check (exists (
    select 1 from public.products p
     where p.id = product_id and p.user_id = (select auth.uid())
  ));

create policy "read own alerts" on public.alerts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "mark own alerts read" on public.alerts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "delete own alerts" on public.alerts
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "own settings" on public.user_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "insights of own products" on public.product_insights
  for all to authenticated
  using (exists (
    select 1 from public.products p
     where p.id = product_id and p.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.products p
     where p.id = product_id and p.user_id = (select auth.uid())
  ));

create policy "read own ai usage" on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));

-- check_runs: no policies -> service role only.

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Atomically consume one AI call from today's quota. Returns false when exhausted.
create function public.consume_ai_quota(daily_limit integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  used integer;
begin
  if uid is null then
    return false;
  end if;

  insert into public.ai_usage (user_id, day, calls)
       values (uid, current_date, 1)
  on conflict (user_id, day) do update
       set calls = public.ai_usage.calls + 1
  returning calls into used;

  return used <= daily_limit;
end;
$$;

-- Public, read-only view of one shared product (whitelisted columns only).
create function public.get_shared_product(slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', p.name,
    'url', p.url,
    'image_url', p.image_url,
    'current_price', p.current_price,
    'original_price', p.original_price,
    'currency', p.currency,
    'in_stock', p.in_stock,
    'lowest_price', p.lowest_price,
    'highest_price', p.highest_price,
    'created_at', p.created_at,
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('price', h.price, 'checked_at', h.checked_at) order by h.checked_at)
        from public.price_history h
       where h.product_id = p.id
    ), '[]'::jsonb)
  )
  from public.products p
  left join public.collections c on c.id = p.collection_id
  where p.share_slug = slug
    and (p.is_public or coalesce(c.is_public, false));
$$;

-- Public, read-only view of a shared collection.
create function public.get_shared_collection(slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', c.name,
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', p.name,
        'url', p.url,
        'image_url', p.image_url,
        'current_price', p.current_price,
        'currency', p.currency,
        'lowest_price', p.lowest_price,
        'highest_price', p.highest_price,
        'share_slug', p.share_slug
      ) order by p.created_at desc)
        from public.products p
       where p.collection_id = c.id
    ), '[]'::jsonb)
  )
  from public.collections c
  where c.share_slug = slug and c.is_public;
$$;

revoke all on function public.consume_ai_quota(integer) from public, anon;
grant execute on function public.consume_ai_quota(integer) to authenticated;

revoke all on function public.get_shared_product(text) from public;
revoke all on function public.get_shared_collection(text) from public;
grant execute on function public.get_shared_product(text) to anon, authenticated;
grant execute on function public.get_shared_collection(text) to anon, authenticated;

revoke all on function public.track_price_extremes() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
