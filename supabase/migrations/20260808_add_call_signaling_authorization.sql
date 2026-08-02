-- Video call signaling (offer/answer/ICE candidates) runs over a channel
-- named `calls:<recipient_user_id>`, so a user can receive an incoming
-- call regardless of which screen they're on - not scoped to a single
-- conversation's channel the way typing broadcasts are (see
-- 20260730_add_realtime_broadcast_authorization.sql).
--
-- Receiving is restricted to a user's own channel. Sending is left open
-- to any authenticated user, matching the posture already accepted for
-- the presence channel (20260802_add_presence_authorization.sql): a
-- call-offer broadcast doesn't expose anything by itself, and the
-- recipient always has to explicitly accept before any media connects -
-- an unwanted offer is just noise the client can ignore, not a security
-- issue. The client must join with `{ config: { private: true } }` for
-- these policies to be enforced at all - see CallContext.tsx.

create policy "users can receive their own call signaling"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and split_part(realtime.topic(), ':', 1) = 'calls'
    and split_part(realtime.topic(), ':', 2) = (select auth.uid()::text)
  );

create policy "authenticated users can send call signaling"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and split_part(realtime.topic(), ':', 1) = 'calls'
  );
