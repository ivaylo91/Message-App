-- Pin a conversation to the top of your own list.
--
-- Per participant, like muted_until and hidden_at: pinning is a personal
-- arrangement of your list and says nothing to anyone else in the
-- conversation. A timestamp rather than a boolean so pinned conversations
-- keep the order they were pinned in (most recently pinned first).
alter table public.conversation_participants
  add column pinned_at timestamptz;

-- UPDATE on conversation_participants is granted per column; the existing
-- "members can update their own last_read_at" policy already limits
-- writes to the user's own row.
grant update (pinned_at) on public.conversation_participants to authenticated;
