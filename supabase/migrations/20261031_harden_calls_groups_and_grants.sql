-- Closes what a review of the live policies and functions turned up.

-- 1. Call signaling.
--
-- Any signed-in user could read and send on any calls:<user id> topic, which
-- is every WebRTC offer, answer and ICE candidate in the app. User ids aren't
-- secret (they come back from profile search), so a stranger could watch who
-- calls whom and the IP addresses in the candidates, ring anyone past a block,
-- or answer in the callee's place and receive the caller's audio and video.
--
-- 20260811 widened this because a caller listens on the callee's topic, so
-- owner-only access broke calling. Access now needs a reason: it's your own
-- topic, or it belongs to someone you have a one-to-one chat with and neither
-- of you has blocked the other.
--
-- Still open: a contact can join your topic, so can see your calls with other
-- people. Closing that means a topic per call, which is a change to the apps
-- and can't be done here.
create function private.can_use_call_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Compared as text rather than cast: a malformed topic has to be refused,
  -- not raise, since an error in a policy fails the whole channel.
  select split_part(p_topic, ':', 1) = 'calls'
    and (
      split_part(p_topic, ':', 2) = (select auth.uid())::text
      or exists (
        select 1
        from public.conversation_participants mine
        join public.conversation_participants theirs
          on theirs.conversation_id = mine.conversation_id
        join public.conversations c
          on c.id = mine.conversation_id
        where mine.user_id = (select auth.uid())
          and theirs.user_id::text = split_part(p_topic, ':', 2)
          and c.is_group = false
          and not exists (
            select 1
            from public.blocked_users b
            where (b.blocker_id = mine.user_id and b.blocked_id = theirs.user_id)
               or (b.blocker_id = theirs.user_id and b.blocked_id = mine.user_id)
          )
      )
    );
$$;

revoke execute on function private.can_use_call_topic(text) from public, anon;
grant execute on function private.can_use_call_topic(text) to authenticated;

drop policy if exists "authenticated users can send call signaling" on realtime.messages;
drop policy if exists "authenticated users can receive call signaling" on realtime.messages;

create policy "call participants can send call signaling"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and private.can_use_call_topic(realtime.topic())
  );

create policy "call participants can receive call signaling"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and private.can_use_call_topic(realtime.topic())
  );

-- 2. Groups.
--
-- Blocking stops a one-to-one chat, but anyone could still put the person who
-- blocked them into a new group and message them there. Someone who has
-- blocked you is now left out of groups you create or add people to, without
-- an error, so the outcome doesn't confirm the block.
--
-- Also: the group size is capped, so one call can't add thousands of rows, and
-- a group name is held to the limit rename_conversation already applies.
-- p_is_group = false with several people used to create a "one-to-one" chat
-- with no group rules, which the blocking check above only partly covers.
create or replace function public.create_conversation(
  participant_ids uuid[],
  p_is_group boolean default null,
  p_name text default null
)
returns public.conversations
language plpgsql
security definer
set search_path = ''
as $$
declare
  all_participants uuid[];
  is_group_final boolean;
  existing_conv_id uuid;
  result public.conversations;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  all_participants := array(
    select distinct unnest(array_append(participant_ids, auth.uid()))
  );

  if array_length(all_participants, 1) < 2 then
    raise exception 'A conversation needs at least one other participant';
  end if;

  if array_length(all_participants, 1) > 256 then
    raise exception 'A group can have at most 256 people';
  end if;

  is_group_final := coalesce(p_is_group, false) or array_length(all_participants, 1) > 2;

  if not is_group_final then
    select c.id into existing_conv_id
    from public.conversations c
    where c.is_group = false
      and exists (
        select 1 from public.conversation_participants
        where conversation_id = c.id and user_id = all_participants[1]
      )
      and exists (
        select 1 from public.conversation_participants
        where conversation_id = c.id and user_id = all_participants[2]
      )
    limit 1;

    if existing_conv_id is not null then
      select * into result from public.conversations where id = existing_conv_id;
      return result;
    end if;
  else
    all_participants := array(
      select uid from unnest(all_participants) as uid
      where not exists (
        select 1 from public.blocked_users b
        where b.blocker_id = uid and b.blocked_id = auth.uid()
      )
    );

    v_name := nullif(btrim(p_name), '');
    if length(v_name) > 60 then
      raise exception 'A group name must be between 1 and 60 characters';
    end if;
  end if;

  insert into public.conversations (is_group, name)
  values (is_group_final, case when is_group_final then v_name else null end)
  returning * into result;

  insert into public.conversation_participants (conversation_id, user_id, role)
  select result.id, uid, case when uid = auth.uid() then 'ADMIN' else 'MEMBER' end
  from unnest(all_participants) as uid;

  return result;
end;
$$;

create or replace function public.add_conversation_participants(
  p_conversation_id uuid,
  p_user_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id
      and user_id = auth.uid()
      and role = 'ADMIN'
  ) then
    raise exception 'Only a group admin can add people to this conversation';
  end if;

  if not exists (
    select 1 from public.conversations
    where id = p_conversation_id and is_group = true
  ) then
    raise exception 'People can only be added to a group conversation';
  end if;

  if (
    select count(*) + coalesce(array_length(p_user_ids, 1), 0)
    from public.conversation_participants
    where conversation_id = p_conversation_id
  ) > 256 then
    raise exception 'A group can have at most 256 people';
  end if;

  insert into public.conversation_participants (conversation_id, user_id, role)
  select p_conversation_id, uid, 'MEMBER'
  from unnest(p_user_ids) as uid
  where not exists (
    select 1 from public.blocked_users b
    where b.blocker_id = uid and b.blocked_id = auth.uid()
  )
  on conflict (conversation_id, user_id) do nothing;
end;
$$;

-- 3. Message timestamps.
--
-- created_at decides a message's place in the thread and the chat list, and a
-- client could set it to anything: backdating a message into history, or
-- future-dating one to sit at the top of someone's list. The apps never send
-- these, so the server now always decides them.
create function private.set_message_server_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  new.edited_at := null;
  new.deleted_at := null;
  return new;
end;
$$;

revoke execute on function private.set_message_server_fields() from public, anon, authenticated;

create trigger set_message_server_fields
  before insert on public.messages
  for each row execute function private.set_message_server_fields();

-- 4. Policies written before the app's convention: applied to every role, and
-- calling auth.uid() per row.
drop policy "view own blocks" on public.blocked_users;
drop policy "create own blocks" on public.blocked_users;
drop policy "remove own blocks" on public.blocked_users;
drop policy "file a report" on public.reports;

create policy "view own blocks"
  on public.blocked_users for select to authenticated
  using ((select auth.uid()) = blocker_id);

create policy "create own blocks"
  on public.blocked_users for insert to authenticated
  with check ((select auth.uid()) = blocker_id);

create policy "remove own blocks"
  on public.blocked_users for delete to authenticated
  using ((select auth.uid()) = blocker_id);

create policy "file a report"
  on public.reports for insert to authenticated
  with check ((select auth.uid()) = reporter_id);

-- 5. Grants. RLS is what protects these tables today, so one mistake in a
-- policy would be all that stands between them and the public key that ships
-- in every copy of the app. Nothing here uses the anon role, which also held
-- TRUNCATE on every table; RLS doesn't apply to TRUNCATE.
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon;
