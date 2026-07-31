-- Fixes two issues found in a mobile-security audit: (1) the previous
-- client-built PostgREST .or() filter interpolated raw user input into a
-- filter string with no escaping, letting a crafted search term inject
-- extra predicates (filter/schema-enumeration injection); (2) partial
-- matching on email/phone, combined with returning those columns
-- directly, let any authenticated user harvest every other user's
-- contact info by iterating short search substrings. This RPC uses a
-- genuine bound parameter (no string-built filter), narrows matching on
-- the sensitive fields to an exact match (you must already know the
-- phone/email, not guess it), and only returns the fields meant to be a
-- public, searchable identity (name/username/avatar) - never email or
-- phone.
create or replace function public.search_profiles(query text)
returns table (
  id uuid,
  display_name text,
  avatar_path text,
  username text
)
language sql
stable
set search_path to 'public'
as $$
  select p.id, p.display_name, p.avatar_path, p.username
  from public.profiles p
  where length(trim(query)) >= 2
    and p.id <> (select auth.uid())
    and (
      p.display_name ilike '%' || trim(query) || '%'
      or p.username ilike '%' || trim(query) || '%'
      or p.email = trim(query)
      or p.phone = regexp_replace(trim(query), '[^0-9+]', '', 'g')
    )
  limit 20;
$$;

grant execute on function public.search_profiles(text) to authenticated;
