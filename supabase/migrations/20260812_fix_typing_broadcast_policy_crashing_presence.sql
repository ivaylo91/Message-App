-- The typing-broadcast policies unconditionally cast the topic's second
-- segment to uuid before checking whether the topic even belongs to them
-- (messages:<conversation_id>). For any OTHER topic with no colon - most
-- notably 'online-users' (see 20260802_add_presence_authorization.sql) -
-- split_part(topic, ':', 2) returns an empty string, and ''::uuid raises
-- a hard Postgres error rather than just failing the check.
--
-- Since Postgres combines multiple permissive RLS policies for the same
-- command with OR, one policy's expression throwing an error aborts the
-- whole query - even though the separate, correct "authenticated users
-- can receive presence" policy would have allowed it. This made presence
-- (online/offline status) fail on every single read, silently: clients
-- would see a channel join get rejected as unauthorized while the actual
-- cause was this unrelated policy erroring out on the topic shape.
--
-- Fix: guard the uuid cast behind a check that the topic is actually
-- ours (starts with 'messages:'), matching the pattern already used for
-- calls: topics in 20260808_add_call_signaling_authorization.sql.
drop policy if exists "conversation participants can send typing broadcasts" on realtime.messages;
drop policy if exists "conversation participants can receive typing broadcasts" on realtime.messages;

create policy "conversation participants can send typing broadcasts"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and split_part(realtime.topic(), ':', 1) = 'messages'
    and public.is_conversation_participant((split_part(realtime.topic(), ':', 2))::uuid)
  );

create policy "conversation participants can receive typing broadcasts"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and split_part(realtime.topic(), ':', 1) = 'messages'
    and public.is_conversation_participant((split_part(realtime.topic(), ':', 2))::uuid)
  );
