-- Backs the "Offline · last seen Xm ago" status - presence itself
-- (PresenceContext) is a purely ephemeral Realtime channel with no
-- history, so there's nothing to show once someone drops off it unless
-- their last-known-online moment is persisted somewhere.
alter table public.profiles add column last_seen_at timestamptz;

-- Same self-only-update shape as display_name/avatar_path/username/phone
-- (see 20260801_add_username_and_phone_to_profiles.sql) - the existing
-- "users can update own profile" RLS policy already scopes this to the
-- caller's own row, this just adds the column to what they're allowed
-- to touch at all.
grant update (last_seen_at) on public.profiles to authenticated;
