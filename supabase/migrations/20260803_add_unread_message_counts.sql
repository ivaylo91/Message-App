-- Bulk unread-message counts, one round trip for the whole conversation
-- list instead of a per-conversation query. "Unread" means messages from
-- someone else, sent after the caller's own last_read_at for that
-- conversation (see markConversationRead() in conversations.ts, which is
-- what advances last_read_at).

create or replace function public.unread_message_counts()
returns table (conversation_id uuid, unread_count bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select m.conversation_id, count(*)::bigint as unread_count
  from public.messages m
  join public.conversation_participants cp
    on cp.conversation_id = m.conversation_id
   and cp.user_id = (select auth.uid())
  where m.sender_id <> (select auth.uid())
    and m.deleted_at is null
    and m.created_at > coalesce(cp.last_read_at, 'epoch'::timestamptz)
  group by m.conversation_id;
$$;

grant execute on function public.unread_message_counts() to authenticated;
