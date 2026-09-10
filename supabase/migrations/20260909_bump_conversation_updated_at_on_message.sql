-- fetchConversations() orders the chat list by conversations.updated_at
-- descending - but nothing has ever written to that column. It defaults to
-- now() when the row is created and is never touched again, so every
-- conversation carried updated_at = created_at and the "most recent first"
-- list was really sorted by when each conversation was *started*. In this
-- project's own data that put a 105-message thread below an empty
-- conversation created a few days later.
--
-- Bumping it on every message insert makes the existing order-by mean what
-- it reads like. It also gives the client something consistent to reorder
-- against optimistically: ConversationsScreen moves a conversation to the
-- top when a message for it arrives over realtime, and that now matches
-- what the next refetch returns instead of being undone by it.
--
-- SECURITY DEFINER because participants hold no update grant on
-- conversations (only conversation_participants.hidden_at is granted - see
-- 20260805_add_hide_conversation.sql). Authorization has already happened
-- by this point: the messages INSERT policy decided whether this row was
-- allowed to exist at all, and this trigger only ever touches the
-- conversation that message is already in.
--
-- EXECUTE is revoked so this can't also be called as an RPC - a
-- SECURITY DEFINER function in the public schema is otherwise exposed at
-- /rest/v1/rpc/ by default, which is not wanted for a trigger body.
--
-- Note that conversations is deliberately not in the supabase_realtime
-- publication, so this write produces no extra realtime traffic: clients
-- reorder from the message INSERT they already receive.

create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- The guard keeps a late/out-of-order insert from dragging updated_at
  -- backwards, and makes the write a no-op rather than a wasted row
  -- version when the conversation is already current.
  update public.conversations
  set updated_at = new.created_at
  where id = new.conversation_id
    and updated_at < new.created_at;
  return new;
end;
$$;

revoke execute on function public.touch_conversation_on_message() from public, anon, authenticated;

create trigger on_message_touches_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_on_message();

-- Backfill, so existing conversations sort correctly straight away rather
-- than only after each one next receives a message. Conversations with no
-- messages keep their creation timestamp, which is the right answer for
-- them.
update public.conversations c
set updated_at = greatest(c.created_at, latest.last_message_at)
from (
  select conversation_id, max(created_at) as last_message_at
  from public.messages
  group by conversation_id
) as latest
where latest.conversation_id = c.id
  and c.updated_at < latest.last_message_at;
