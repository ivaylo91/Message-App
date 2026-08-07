-- The presence SELECT/INSERT policies added in
-- 20260802_add_presence_authorization.sql combined
-- `extension = 'presence'` with `realtime.topic() = 'online-users'` in a
-- single AND'd predicate. Empirically (confirmed live via repeated,
-- patient reconnect testing - not a transient warm-up delay) Realtime's
-- private-channel authorization never granted access under that combined
-- predicate, even after 8+ minutes: every client's channel.subscribe()
-- permanently failed with "Unauthorized: You do not have permissions to
-- read from this Channel topic: online-users", so online/offline status
-- never worked at all, for anyone.
--
-- Dropping the topic() half and keeping only the extension check does
-- authorize correctly. This isn't a security loosening in practice:
-- 'online-users' is the only presence topic the client ever uses (see
-- PRESENCE_TOPIC in mobile/src/presence/PresenceContext.tsx) and this
-- policy only ever gated the 'presence' extension's rows to begin with -
-- it can't grant access to the separately-guarded broadcast rows (typing,
-- call signaling) other policies restrict by conversation/callee.
drop policy if exists "authenticated users can receive presence" on realtime.messages;
drop policy if exists "authenticated users can send presence" on realtime.messages;

create policy "authenticated users can receive presence"
  on realtime.messages
  for select
  to authenticated
  using (
    extension = 'presence'
  );

create policy "authenticated users can send presence"
  on realtime.messages
  for insert
  to authenticated
  with check (
    extension = 'presence'
  );
