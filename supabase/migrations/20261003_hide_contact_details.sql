-- Stop exposing every user's email and phone number to every other user.
--
-- profiles had a table-level SELECT grant and a row policy of `true` for
-- signed-in users, so any account could list everyone's contact details
-- with one request - search_profiles' exact-match-only design (see
-- 20260806_add_secure_search_profiles_rpc.sql) closed the search path but
-- not the table itself.
--
-- DEPLOY ORDER: apply only once a build that selects named columns is
-- installed. Builds up to versionCode 5 select `profiles(*)`, which
-- Postgres refuses outright once any column is ungranted - their chat
-- list and chats would fail to load.

-- A column-level REVOKE does nothing while the table-level grant exists,
-- so the table grant goes and the shareable columns are granted back by
-- name. A column added to profiles later is therefore private until it
-- is deliberately listed here - the safer default.
revoke select on public.profiles from anon, authenticated;
grant select (
  id,
  display_name,
  avatar_path,
  username,
  last_seen_at,
  created_at,
  show_read_receipts,
  show_last_seen
) on public.profiles to authenticated;

-- anon never had a row policy on profiles, so these were inert - but an
-- inert grant is one policy mistake away from a live one.
revoke insert, update, delete, truncate, references, trigger on public.profiles from anon;

-- The owner still needs their own email and phone (the profile screen,
-- and re-authenticating before account deletion), and a column grant
-- can't be scoped to "your own row".
create function public.get_my_contact_details()
returns table (email text, phone text)
language sql
stable
security definer
set search_path to ''
as $$
  select p.email, p.phone
  from public.profiles p
  where p.id = (select auth.uid());
$$;

revoke execute on function public.get_my_contact_details() from public, anon;
grant execute on function public.get_my_contact_details() to authenticated;

-- search_profiles matched on email and phone with the caller's own
-- privileges, so it would stop finding anyone by either. It becomes
-- SECURITY DEFINER to keep reading them - still exact-match only, and
-- still returning neither - with a fixed empty search_path and fully
-- qualified names, as a definer function must. auth.uid() is required
-- explicitly now that RLS no longer applies inside it.
create or replace function public.search_profiles(query text)
returns table (id uuid, display_name text, avatar_path text, username text)
language sql
stable
security definer
set search_path to ''
as $$
  with escaped as (
    select replace(replace(replace(trim(query), '\', '\\'), '%', '\%'), '_', '\_') as pattern
  )
  select p.id, p.display_name, p.avatar_path, p.username
  from public.profiles p, escaped
  where (select auth.uid()) is not null
    and length(trim(query)) >= 2
    and p.id <> (select auth.uid())
    and (
      p.display_name ilike '%' || escaped.pattern || '%'
      or p.username ilike '%' || escaped.pattern || '%'
      or p.email = trim(query)
      or p.phone = pg_catalog.regexp_replace(trim(query), '[^0-9+]', '', 'g')
    )
  limit 20;
$$;

revoke execute on function public.search_profiles(text) from public, anon;
grant execute on function public.search_profiles(text) to authenticated;

-- A sign-up without a display name used to get the full email address as
-- its name - publishing exactly what this migration hides. The part
-- before the @ is a reasonable starting name the user can change.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;
