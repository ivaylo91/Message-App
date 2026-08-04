-- The caller needs to receive call-answer/ice-candidate broadcasts back on
-- the same calls:<calleeId> topic it uses to send the offer - that topic is
-- owned by the callee, not the caller, so the previous auth.uid()-restricted
-- SELECT policy blocked the caller from ever reading on it, meaning the
-- caller's own channel.subscribe() never reached SUBSCRIBED and the offer
-- was never sent. Widen receive to match the existing send policy's scope
-- (any authenticated user, any calls: topic) - call topics are unguessable
-- user ids, not secret, and the send side is already this open.
drop policy if exists "users can receive their own call signaling" on realtime.messages;

create policy "authenticated users can receive call signaling"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and split_part(realtime.topic(), ':', 1) = 'calls'
);
