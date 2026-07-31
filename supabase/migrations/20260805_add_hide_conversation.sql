-- Lets a user "delete" a conversation from their own list without
-- affecting the other participant(s) - matches WhatsApp/Messenger's
-- per-user "Delete chat": the conversation and its history stay intact
-- for everyone else, and a new message arriving afterward automatically
-- un-hides it rather than leaving it silently blocked forever.

alter table public.conversation_participants add column hidden_at timestamptz;

grant update (hidden_at) on public.conversation_participants to authenticated;

create or replace function public.unhide_conversation_for_participants()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.conversation_participants
  set hidden_at = null
  where conversation_id = new.conversation_id
    and hidden_at is not null;
  return new;
end;
$$;

create trigger on_message_unhides_conversation
  after insert on public.messages
  for each row execute function public.unhide_conversation_for_participants();
