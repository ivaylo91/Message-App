-- Typing-indicator broadcasts run over a channel named
-- `messages:<conversation_id>` with no RLS on realtime.messages, so
-- Realtime falls back to "Allow public access" for it - meaning any
-- authenticated (or anon, if that's also enabled project-wide) client
-- could join `messages:<any conversation id>` and see who's typing in
-- a conversation they aren't part of. Locking this down to actual
-- participants, per Supabase's Realtime Authorization model.
--
-- The client must also join the channel with `{ config: { private:
-- true } }` for these policies to be enforced at all - see
-- ChatScreen.tsx.

create policy "conversation participants can send typing broadcasts"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and public.is_conversation_participant((split_part(realtime.topic(), ':', 2))::uuid)
  );

create policy "conversation participants can receive typing broadcasts"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.is_conversation_participant((split_part(realtime.topic(), ':', 2))::uuid)
  );