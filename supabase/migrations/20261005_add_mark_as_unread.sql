-- "Mark as unread": flag a conversation to come back to, even when every
-- message in it has been read.
--
-- Per participant, like pinned_at and muted_until - it arranges only your
-- own list. Stored here rather than on the device so it holds across
-- devices. Cleared by the same update that marks the conversation read
-- (markConversationRead), so opening the chat clears it.
alter table public.conversation_participants
  add column marked_unread boolean not null default false;

-- UPDATE on conversation_participants is granted per column; the existing
-- row policy limits writes to the user's own row.
grant update (marked_unread) on public.conversation_participants to authenticated;
