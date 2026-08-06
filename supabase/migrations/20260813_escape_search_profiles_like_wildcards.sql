-- search_profiles builds an ILIKE pattern from user input without
-- escaping % or _, so a search term containing either acts as a
-- wildcard instead of a literal character (e.g. "50%_off" over-matches)
-- - same class of finding as the client-side searchMessages fix (see
-- escapeLikePattern), just server-side. Not SQL injection - `query` was
-- already a genuine bound function parameter - purely a LIKE-wildcard
-- correctness issue, scoped to data the caller can already read.
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
  with escaped as (
    select replace(replace(replace(trim(query), '\', '\\'), '%', '\%'), '_', '\_') as pattern
  )
  select p.id, p.display_name, p.avatar_path, p.username
  from public.profiles p, escaped
  where length(trim(query)) >= 2
    and p.id <> (select auth.uid())
    and (
      p.display_name ilike '%' || escaped.pattern || '%'
      or p.username ilike '%' || escaped.pattern || '%'
      or p.email = trim(query)
      or p.phone = regexp_replace(trim(query), '[^0-9+]', '', 'g')
    )
  limit 20;
$$;
