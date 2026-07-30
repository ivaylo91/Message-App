-- Online/offline status, via Supabase Realtime Presence on a single
-- shared topic ("online-users") that every authenticated user tracks
-- themselves into on the client (see PresenceContext.tsx). Unlike the
-- per-conversation typing broadcasts, presence isn't scoped to a
-- conversation - anyone's online state is visible to any authenticated
-- user, matching how broadly search_profiles already exposes profiles
-- (see searchProfiles() in profiles.ts, which has no participant
-- restriction either).
--
-- As with the typing broadcasts, the client must join with
-- `{ config: { private: true } }` for these policies to be enforced.

create policy "authenticated users can send presence"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and realtime.topic() = 'online-users'
  );

create policy "authenticated users can receive presence"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'presence'
    and realtime.topic() = 'online-users'
  );
