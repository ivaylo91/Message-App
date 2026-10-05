-- Cache for the link-preview Edge Function, so a link shared in a busy
-- group is fetched once rather than once per person scrolling past it.
--
-- Read and written only by that function, with the service role. RLS is
-- on with no policies and the API roles hold no grants, so no client can
-- read it - which links people have been sharing is not anyone else's
-- business. A row with a null title records "nothing to preview", so a
-- dead link isn't refetched either.
create table public.link_previews (
  url text primary key,
  title text,
  description text,
  site_name text,
  fetched_at timestamptz not null default now()
);

alter table public.link_previews enable row level security;
revoke all on public.link_previews from anon, authenticated;
