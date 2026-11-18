-- JewelAR: gold/silver rates, auto pricing, WhatsApp enquiry, analytics
-- Run once in Supabase Dashboard -> SQL Editor (after 02_owners.sql)

-- 1. Shop settings + today's published rates (single row, id = 1)
create table if not exists public.shop_settings (
  id int primary key default 1 check (id = 1),
  whatsapp_number text default '',          -- with country code, digits only, e.g. 919876543210
  gst_percent numeric(5, 2) not null default 3,
  rate_premium_percent numeric(5, 2) not null default 9, -- local premium over international price
  gold24 numeric(12, 2),                    -- ₹ per gram
  gold22 numeric(12, 2),
  gold18 numeric(12, 2),
  silver numeric(12, 2),
  rates_updated_at timestamptz
);
insert into public.shop_settings (id) values (1) on conflict (id) do nothing;
alter table public.shop_settings enable row level security;

drop policy if exists "anyone reads settings" on public.shop_settings;
create policy "anyone reads settings" on public.shop_settings
  for select to anon, authenticated using (true);

drop policy if exists "owners update settings" on public.shop_settings;
create policy "owners update settings" on public.shop_settings
  for update to authenticated using (public.is_shop_owner()) with check (public.is_shop_owner());

-- 2. Pricing details on each piece
alter table public.jewellery
  add column if not exists purity text not null default '22K'
    check (purity in ('24K', '22K', '18K', 'silver', 'other')),
  add column if not exists making_type text not null default 'percent'
    check (making_type in ('percent', 'per_gram', 'fixed')),
  add column if not exists making_value numeric(12, 2) not null default 0,
  add column if not exists stone_value numeric(12, 2) not null default 0,
  add column if not exists auto_price boolean not null default false;

-- 3. Analytics events (customers write, only owners read)
create table if not exists public.jewel_events (
  id bigint generated always as identity primary key,
  jewel_id uuid not null references public.jewellery (id) on delete cascade,
  kind text not null check (kind in ('view', 'tryon', 'enquiry', 'share', 'wishlist')),
  created_at timestamptz not null default now()
);
create index if not exists jewel_events_jewel_time on public.jewel_events (jewel_id, created_at);
alter table public.jewel_events enable row level security;

drop policy if exists "anyone logs events" on public.jewel_events;
create policy "anyone logs events" on public.jewel_events
  for insert to anon, authenticated with check (true);

drop policy if exists "owners read events" on public.jewel_events;
create policy "owners read events" on public.jewel_events
  for select to authenticated using (public.is_shop_owner());

-- Per-piece totals for the last N days (owners only)
create or replace function public.jewel_stats(days int default 30)
returns table (
  jewel_id uuid, name text, image_url text,
  views bigint, tryons bigint, enquiries bigint, shares bigint, wishlists bigint
)
language sql stable security definer set search_path = public as $$
  select j.id, j.name, j.image_url,
    count(*) filter (where e.kind = 'view'),
    count(*) filter (where e.kind = 'tryon'),
    count(*) filter (where e.kind = 'enquiry'),
    count(*) filter (where e.kind = 'share'),
    count(*) filter (where e.kind = 'wishlist')
  from public.jewellery j
  left join public.jewel_events e
    on e.jewel_id = j.id and e.created_at > now() - make_interval(days => days)
  where public.is_shop_owner()
  group by j.id
  order by count(e.id) desc, j.created_at desc;
$$;

revoke execute on function public.jewel_stats(int) from public, anon;
grant execute on function public.jewel_stats(int) to authenticated;
