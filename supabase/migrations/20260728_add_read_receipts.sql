-- Read receipts: track when each participant last read a conversation.
-- Typing indicators are handled separately via Realtime Broadcast
-- (ephemeral, not persisted) - no schema change needed for those.

alter table public.conversation_participants
  add column last_read_at timestamptz;

create policy "members can update their own last_read_at"
  on public.conversation_participants for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Column-level grant so a participant can only ever touch their own
-- last_read_at, not role/joined_at, even though the row-level policy
-- above allows updates to their own row.
revoke update on public.conversation_participants from authenticated;
grant update (last_read_at) on public.conversation_participants to authenticated;