-- JewelAR database setup
-- Run this once in Supabase Dashboard -> SQL Editor -> New query -> Run

-- 1. Shop owners (only these accounts can add/edit jewellery)
create table if not exists public.shop_owners (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.shop_owners enable row level security;

drop policy if exists "owners can see themselves" on public.shop_owners;
create policy "owners can see themselves" on public.shop_owners
  for select to authenticated using (user_id = auth.uid());

create or replace function public.is_shop_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shop_owners where user_id = auth.uid());
$$;

-- 2. Jewellery catalogue
create table if not exists public.jewellery (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  price numeric(12, 2),
  metal text default '',
  weight_g numeric(8, 2),
  body_part text not null check (body_part in ('ear', 'nose', 'forehead', 'neck', 'finger', 'wrist')),
  image_url text not null,
  image_path text not null,
  anchor_x real not null default 0.5,
  anchor_y real not null default 0,
  size_scale real not null default 1,
  owner_id uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
alter table public.jewellery enable row level security;

drop policy if exists "anyone can browse" on public.jewellery;
create policy "anyone can browse" on public.jewellery
  for select to anon, authenticated using (true);

drop policy if exists "owners insert" on public.jewellery;
create policy "owners insert" on public.jewellery
  for insert to authenticated with check (public.is_shop_owner());

drop policy if exists "owners update" on public.jewellery;
create policy "owners update" on public.jewellery
  for update to authenticated using (public.is_shop_owner()) with check (public.is_shop_owner());

drop policy if exists "owners delete" on public.jewellery;
create policy "owners delete" on public.jewellery
  for delete to authenticated using (public.is_shop_owner());

-- 3. Image storage (public read, owners write)
insert into storage.buckets (id, name, public)
values ('jewellery', 'jewellery', true)
on conflict (id) do update set public = true;

drop policy if exists "owners upload images" on storage.objects;
create policy "owners upload images" on storage.objects
  for insert to authenticated with check (bucket_id = 'jewellery' and public.is_shop_owner());

drop policy if exists "owners update images" on storage.objects;
create policy "owners update images" on storage.objects
  for update to authenticated using (bucket_id = 'jewellery' and public.is_shop_owner());

drop policy if exists "owners delete images" on storage.objects;
create policy "owners delete images" on storage.objects
  for delete to authenticated using (bucket_id = 'jewellery' and public.is_shop_owner());

-- 4. Make your account a shop owner:
--    a) Dashboard -> Authentication -> Users -> "Add user" (email + password)
--    b) Run this with that email:
-- insert into public.shop_owners (user_id)
--   select id from auth.users where email = 'owner@yourshop.com';
