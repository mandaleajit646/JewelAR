-- JewelAR: 3D try-on for bangles, kadas and rings
-- Run once in Supabase Dashboard -> SQL Editor (after 03_features.sql)

alter table public.jewellery
  add column if not exists band_3d boolean not null default false,
  add column if not exists band_size text not null default '',
  add column if not exists band_profile text not null default 'dome'
    check (band_profile in ('flat', 'dome', 'round', 'kada'));

-- Refresh the API schema cache so the app sees the new columns immediately.
notify pgrst, 'reload schema';
