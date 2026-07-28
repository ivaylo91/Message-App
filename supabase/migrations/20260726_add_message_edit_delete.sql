-- Let a sender edit their own message body, or soft-delete it
-- (deleted_at), but nothing else (sender_id, conversation_id,
-- created_at stay immutable).

create policy "senders can edit or delete their own messages"
  on public.messages for update
  to authenticated
  using (sender_id = (select auth.uid()))
  with check (sender_id = (select auth.uid()));

revoke update on public.messages from authenticated;
grant update (body, edited_at, deleted_at) on public.messages to authenticated;