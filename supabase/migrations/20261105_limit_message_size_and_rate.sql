-- Three limits the messages table never had. The app talks to Supabase
-- directly, so anything the composer doesn't stop, a signed-in user can
-- still send straight through /rest/v1/messages.

-- 1. Cap the body length.
--
-- Nothing bounded it, so one request could store megabytes in a single
-- row: it bloats the table, breaks bubble layout, and blows past FCM's
-- 4KB payload in the push trigger. 4096 matches Telegram. The longest body
-- stored when this was written was 173 characters, so the constraint
-- validates against existing rows.
--
-- A violation comes back as 23514. The composer caps input at the same
-- length (MAX_MESSAGE_LENGTH), and OutboxContext drops a 23514 instead of
-- retrying it - before that, app versions retried it forever, jamming the
-- queue behind it.

alter table public.messages
  add constraint messages_body_length_check
  check (char_length(body) <= 4096);

-- 2. Rate-limit sends per sender.
--
-- 30 messages in any 10 seconds, across all conversations. An album is up
-- to 10 messages (MAX_IMAGE_SELECTION) inserted back to back, so normal
-- use stays well under it.
--
-- SQLSTATE PT429 makes PostgREST answer HTTP 429. It is deliberately not
-- 42501: OutboxContext drops 42501 rejections silently (that's how blocks
-- stay hidden), whereas any other error leaves the message queued for the
-- next flush - which is what a rate-limited message should do.
--
-- SECURITY DEFINER so the count includes the sender's messages in
-- conversations they have since left, which RLS would otherwise hide.
-- The count is not race-proof under concurrent inserts; it is an abuse
-- brake, not an exact quota.

create index messages_sender_id_created_at_idx
  on public.messages (sender_id, created_at desc);

-- The composite index leads with sender_id, so it covers the foreign key
-- that this one existed for.
drop index public.messages_sender_id_idx;

create function private.enforce_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sender_id is null then
    return new;
  end if;

  if (
    select count(*)
    from public.messages
    where sender_id = new.sender_id
      and created_at > now() - interval '10 seconds'
  ) >= 30 then
    raise exception 'Sending too fast, try again in a few seconds'
      using errcode = 'PT429';
  end if;

  return new;
end;
$$;

-- Trigger functions are checked for EXECUTE when the trigger is created,
-- not when it fires (see the README's note on the private schema).
revoke execute on function private.enforce_message_rate_limit() from public, anon, authenticated;

-- BEFORE triggers fire in name order, so this runs ahead of
-- set_message_server_fields and rejects before any other work is done.
create trigger enforce_message_rate_limit
  before insert on public.messages
  for each row execute function private.enforce_message_rate_limit();

-- 3. Index message search.
--
-- searchMessages uses .ilike('body', '%term%'), which no btree index can
-- serve, so every search scanned all messages. A trigram GIN index serves
-- it for terms of 3+ characters; 1-2 character terms still scan.
-- pg_trgm goes in the extensions schema, not public (the advisor already
-- flags pg_net for being there).

create extension if not exists pg_trgm with schema extensions;

create index messages_body_trgm_idx
  on public.messages
  using gin (body extensions.gin_trgm_ops);
