-- Groups could be created and then never changed again: no rename, no
-- adding anyone, no removing anyone, not even a way to leave. There are
-- no INSERT/DELETE policies on conversation_participants and no UPDATE
-- policy on conversations at all - everything went through
-- create_conversation() and stopped there.
--
-- These operations can't be expressed as simple per-row RLS (deciding
-- whether *this* user may add *that* user needs the caller's role in a
-- different row), so they follow the pattern create_conversation already
-- set: SECURITY DEFINER RPCs that do their own authorization. They live
-- in public because the client calls them, and are revoked from anon
-- like the other three.
--
-- On roles: conversation_participants.role has existed since the
-- beginning, but create_conversation never set it, so every row in the
-- database is 'MEMBER' and no group has ever had an admin. Two
-- consequences handled here:
--
--   1. create_conversation is updated to make the creator an ADMIN.
--   2. Existing group participants are all promoted to ADMIN. There is
--      no created_by column, and participant rows carry no timestamp, so
--      the original creator of an existing group is genuinely
--      unrecoverable - promoting everyone is the only non-arbitrary
--      choice, and leaves those groups manageable by the people already
--      in them rather than frozen forever.

create or replace function public.create_conversation(
  participant_ids uuid[],
  p_is_group boolean default null,
  p_name text default null
)
returns public.conversations
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  all_participants uuid[];
  is_group_final boolean;
  existing_conv_id uuid;
  result public.conversations;
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

  is_group_final := coalesce(p_is_group, array_length(all_participants, 1) > 2);

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
  end if;

  insert into public.conversations (is_group, name)
  values (is_group_final, case when is_group_final then p_name else null end)
  returning * into result;

  -- The only change from the previous definition: whoever creates the
  -- conversation is its first admin, so a new group is manageable.
  insert into public.conversation_participants (conversation_id, user_id, role)
  select result.id, uid, case when uid = auth.uid() then 'ADMIN' else 'MEMBER' end
  from unnest(all_participants) as uid;

  return result;
end;
$function$;

-- One-time legacy promotion; see the header note on why everyone.
update public.conversation_participants cp
set role = 'ADMIN'
from public.conversations c
where c.id = cp.conversation_id
  and c.is_group = true
  and cp.role <> 'ADMIN';

create or replace function public.rename_conversation(
  p_conversation_id uuid,
  p_name text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_trimmed text := nullif(btrim(p_name), '');
begin
  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id
      and user_id = auth.uid()
      and role = 'ADMIN'
  ) then
    raise exception 'Only a group admin can rename this conversation';
  end if;

  if not exists (
    select 1 from public.conversations
    where id = p_conversation_id and is_group = true
  ) then
    raise exception 'Only group conversations have a name';
  end if;

  if v_trimmed is null or length(v_trimmed) > 60 then
    raise exception 'A group name must be between 1 and 60 characters';
  end if;

  update public.conversations set name = v_trimmed where id = p_conversation_id;
end;
$function$;

create or replace function public.add_conversation_participants(
  p_conversation_id uuid,
  p_user_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- on conflict: re-adding someone already in the group is a no-op
  -- rather than an error, since the client can race its own list.
  insert into public.conversation_participants (conversation_id, user_id, role)
  select p_conversation_id, uid, 'MEMBER'
  from unnest(p_user_ids) as uid
  on conflict (conversation_id, user_id) do nothing;
end;
$function$;

create or replace function public.remove_conversation_participant(
  p_conversation_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_is_admin boolean;
  v_is_self boolean := p_user_id = auth.uid();
begin
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id
      and user_id = auth.uid()
      and role = 'ADMIN'
  ) into v_is_admin;

  -- Leaving is always your own right; removing somebody else is not.
  if not v_is_self and not v_is_admin then
    raise exception 'Only a group admin can remove someone from this conversation';
  end if;

  if not exists (
    select 1 from public.conversations
    where id = p_conversation_id and is_group = true
  ) then
    raise exception 'People can only be removed from a group conversation';
  end if;

  delete from public.conversation_participants
  where conversation_id = p_conversation_id and user_id = p_user_id;

  -- A group whose last admin walks out would otherwise be permanently
  -- unmanageable - nobody could rename it, add anyone, or remove anyone.
  -- Promoting the remaining members keeps it usable without inventing a
  -- rule for which one of them inherits it.
  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and role = 'ADMIN'
  ) then
    update public.conversation_participants
    set role = 'ADMIN'
    where conversation_id = p_conversation_id;
  end if;
end;
$function$;

revoke execute on function public.rename_conversation(uuid, text) from public, anon;
grant execute on function public.rename_conversation(uuid, text) to authenticated, service_role;

revoke execute on function public.add_conversation_participants(uuid, uuid[]) from public, anon;
grant execute on function public.add_conversation_participants(uuid, uuid[]) to authenticated, service_role;

revoke execute on function public.remove_conversation_participant(uuid, uuid) from public, anon;
grant execute on function public.remove_conversation_participant(uuid, uuid) to authenticated, service_role;
