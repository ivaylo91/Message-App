-- Message replies: a message can optionally quote-reply to an earlier
-- message in the same conversation. Enforced in the INSERT policy
-- (rather than a table CHECK constraint, since validating same-
-- conversation membership needs a subquery) so a reply can never point
-- at a message from a different conversation.

alter table public.messages
  add column reply_to_message_id uuid references public.messages(id) on delete set null;

create index messages_reply_to_message_id_idx
  on public.messages(reply_to_message_id);

drop policy "members can send messages as themselves" on public.messages;

create policy "members can send messages as themselves"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and is_conversation_participant(conversation_id)
    and (
      reply_to_message_id is null
      or exists (
        select 1
        from public.messages m
        where m.id = messages.reply_to_message_id
          and m.conversation_id = messages.conversation_id
      )
    )
  );