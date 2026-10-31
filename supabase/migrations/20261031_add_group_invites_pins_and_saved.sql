-- Group invite links, a pinned message per conversation, and saved messages.

-- 1. Group invite links.
--
-- Tokens never leave through a table policy: RLS is on with no policies, so
-- the only way in is the functions below, which decide who may see or use
-- one. 122 random bits from gen_random_uuid, so a link can't be guessed.
create table public.group_invites (
  conversation_id uuid primary key references public.conversations (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.group_invites enable row level security;
revoke all on public.group_invites from anon, authenticated;

create function private.is_group_admin(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_participants p
    join public.conversations c on c.id = p.conversation_id
    where p.conversation_id = p_conversation_id
      and p.user_id = (select auth.uid())
      and p.role = 'ADMIN'
      and c.is_group = true
  );
$$;

revoke execute on function private.is_group_admin(uuid) from public, anon;
grant execute on function private.is_group_admin(uuid) to authenticated;

-- One live link per group, made the first time an admin asks for it.
create function public.get_group_invite(p_conversation_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not private.is_group_admin(p_conversation_id) then
    raise exception 'Only a group admin can share an invite link';
  end if;

  insert into public.group_invites (conversation_id, created_by)
  values (p_conversation_id, auth.uid())
  on conflict (conversation_id) do nothing;

  select token into v_token from public.group_invites where conversation_id = p_conversation_id;
  return v_token;
end;
$$;

-- For a link that got out: the old token stops working immediately.
create function public.reset_group_invite(p_conversation_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not private.is_group_admin(p_conversation_id) then
    raise exception 'Only a group admin can reset an invite link';
  end if;

  insert into public.group_invites (conversation_id, created_by)
  values (p_conversation_id, auth.uid())
  on conflict (conversation_id) do update
    set token = replace(gen_random_uuid()::text, '-', ''),
        created_by = auth.uid(),
        created_at = now()
  returning token into v_token;

  return v_token;
end;
$$;

-- What the "Join this group?" sheet shows. Empty for a dead link. Holding the
-- token is what earns seeing the group's name, as with any invite link.
create function public.preview_group_invite(p_token text)
returns table (conversation_id uuid, name text, member_count bigint, is_member boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.name,
    (select count(*) from public.conversation_participants p where p.conversation_id = c.id),
    exists (
      select 1 from public.conversation_participants p
      where p.conversation_id = c.id and p.user_id = (select auth.uid())
    )
  from public.group_invites i
  join public.conversations c on c.id = i.conversation_id
  where i.token = p_token and c.is_group = true;
$$;

create function public.join_group_by_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select i.conversation_id into v_conversation_id
  from public.group_invites i
  join public.conversations c on c.id = i.conversation_id
  where i.token = p_token and c.is_group = true;

  if v_conversation_id is null then
    raise exception 'This invite link is no longer valid';
  end if;

  if (
    select count(*) from public.conversation_participants
    where conversation_id = v_conversation_id
  ) >= 256 then
    raise exception 'A group can have at most 256 people';
  end if;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values (v_conversation_id, auth.uid(), 'MEMBER')
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;

revoke execute on function public.get_group_invite(uuid) from public, anon;
revoke execute on function public.reset_group_invite(uuid) from public, anon;
revoke execute on function public.preview_group_invite(text) from public, anon;
revoke execute on function public.join_group_by_invite(text) from public, anon;
grant execute on function public.get_group_invite(uuid) to authenticated;
grant execute on function public.reset_group_invite(uuid) to authenticated;
grant execute on function public.preview_group_invite(text) to authenticated;
grant execute on function public.join_group_by_invite(text) to authenticated;

-- 2. Pinned message: one per conversation, visible to everyone in it.
--
-- Anyone in a one-to-one chat can pin; in a group, only an admin. Set through
-- this function rather than a column grant, because the rule depends on the
-- conversation and a policy can't see which columns changed.
alter table public.conversations
  add column pinned_message_id uuid references public.messages (id) on delete set null;

create function public.set_pinned_message(p_conversation_id uuid, p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_group boolean;
begin
  select is_group into v_is_group from public.conversations where id = p_conversation_id;

  if v_is_group is null or not private.is_conversation_participant(p_conversation_id) then
    raise exception 'Only someone in this conversation can pin a message';
  end if;

  if v_is_group and not private.is_group_admin(p_conversation_id) then
    raise exception 'Only a group admin can pin a message';
  end if;

  if p_message_id is not null and not exists (
    select 1 from public.messages
    where id = p_message_id
      and conversation_id = p_conversation_id
      and deleted_at is null
  ) then
    raise exception 'That message is not in this conversation';
  end if;

  update public.conversations set pinned_message_id = p_message_id where id = p_conversation_id;
end;
$$;

revoke execute on function public.set_pinned_message(uuid, uuid) from public, anon;
grant execute on function public.set_pinned_message(uuid, uuid) to authenticated;

-- 3. Saved messages: private to the person who saved them.
--
-- The insert policy's subquery runs under the caller's own RLS on messages,
-- so a message you can't read can't be saved, and leaving a group makes what
-- you saved from it unreadable through the same rule.
create table public.saved_messages (
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

create index saved_messages_message_id_idx on public.saved_messages (message_id);

alter table public.saved_messages enable row level security;
revoke all on public.saved_messages from anon, authenticated;
grant select, insert, delete on public.saved_messages to authenticated;

create policy "view own saved messages"
  on public.saved_messages for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "save messages you can read"
  on public.saved_messages for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.messages m where m.id = message_id)
  );

create policy "remove own saved messages"
  on public.saved_messages for delete to authenticated
  using ((select auth.uid()) = user_id);
