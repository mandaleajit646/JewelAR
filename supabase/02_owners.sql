-- JewelAR: manage shop owners from inside the app
-- Run once in Supabase Dashboard -> SQL Editor (after schema.sql)

-- Does the shop have any owner yet? (used by the "Set up my shop" button)
create or replace function public.shop_has_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shop_owners);
$$;

-- First signed-in user can claim the shop. Does nothing once an owner exists.
create or replace function public.claim_first_owner()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  lock table public.shop_owners in exclusive mode; -- two people can't claim at once
  if exists (select 1 from public.shop_owners) then
    return false;
  end if;
  insert into public.shop_owners (user_id) values (auth.uid());
  return true;
end;
$$;

-- Owners only: list all owners with their email
create or replace function public.list_shop_owners()
returns table (user_id uuid, email text)
language sql stable security definer set search_path = public as $$
  select o.user_id, u.email::text
  from public.shop_owners o
  join auth.users u on u.id = o.user_id
  where public.is_shop_owner()
  order by u.email;
$$;

-- Owners only: make an existing account an owner
create or replace function public.add_shop_owner(owner_email text)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  if not public.is_shop_owner() then
    raise exception 'Only shop owners can add owners';
  end if;
  select id into uid from auth.users where lower(email) = lower(trim(owner_email));
  if uid is null then
    raise exception 'No account with that email. Ask them to sign up in the app first.';
  end if;
  insert into public.shop_owners (user_id) values (uid) on conflict do nothing;
end;
$$;

-- Owners only: remove another owner (you can't remove yourself)
create or replace function public.remove_shop_owner(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_shop_owner() then
    raise exception 'Only shop owners can remove owners';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot remove yourself';
  end if;
  delete from public.shop_owners where user_id = target;
end;
$$;

-- Only signed-in users may call these
revoke execute on function public.claim_first_owner() from public, anon;
revoke execute on function public.list_shop_owners() from public, anon;
revoke execute on function public.add_shop_owner(text) from public, anon;
revoke execute on function public.remove_shop_owner(uuid) from public, anon;
grant execute on function public.claim_first_owner() to authenticated;
grant execute on function public.list_shop_owners() to authenticated;
grant execute on function public.add_shop_owner(text) to authenticated;
grant execute on function public.remove_shop_owner(uuid) to authenticated;
