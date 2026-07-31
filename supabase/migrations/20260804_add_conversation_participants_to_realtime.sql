-- ChatScreen has always subscribed to postgres_changes UPDATE events on
-- this table (to power the real-time "seen" indicator), but the table
-- was never added to the supabase_realtime publication, so those events
-- could never actually fire - "seen" only ever updated by chance, when
-- the screen happened to re-fetch for some other reason. RLS already
-- scopes visibility correctly (same is_conversation_participant() pattern
-- already used for messages/message_reactions, both already in this
-- publication), so this is safe to enable.
alter publication supabase_realtime add table public.conversation_participants;
