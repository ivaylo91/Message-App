-- Blocking lets someone stop receiving new messages from a specific
-- person in a 1:1 conversation; reporting lets them flag a user or
-- message for review. Google Play's User Generated Content policy
-- expects both from apps that let users message each other.

create table public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocked_users_no_self_block check (blocker_id <> blocked_id),
  constraint blocked_users_unique unique (blocker_id, blocked_id)
);

alter table public.blocked_users enable row level security;

create policy "view own blocks"
  on public.blocked_users for select
  using (auth.uid() = blocker_id);

create policy "create own blocks"
  on public.blocked_users for insert
  with check (auth.uid() = blocker_id);

create policy "remove own blocks"
  on public.blocked_users for delete
  using (auth.uid() = blocker_id);

create index blocked_users_blocker_idx on public.blocked_users (blocker_id);
create index blocked_users_blocked_idx on public.blocked_users (blocked_id);

-- One-way mailbox: any signed-in user can file a report about another
-- user (optionally pointing at a specific message), but nobody -
-- including the reporter - can read reports back through the API.
-- There's no in-app moderation UI yet, so review happens via the
-- Supabase SQL editor directly for now.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  reason text not null,
  details text,
  created_at timestamptz not null default now(),
  constraint reports_no_self_report check (reporter_id <> reported_user_id)
);

alter table public.reports enable row level security;

create policy "file a report"
  on public.reports for insert
  with check (auth.uid() = reporter_id);

create index reports_reported_user_idx on public.reports (reported_user_id);

-- Used by the restrictive policy below. SECURITY DEFINER because the
-- sender's own row-level access to blocked_users only covers rows where
-- *they're* the blocker (see "view own blocks" above) - this needs to
-- see past that, to notice the other participant has blocked *them*.
create or replace function public.not_blocked_in_conversation(p_conversation_id uuid, p_sender_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_group boolean;
  v_other_id uuid;
begin
  select is_group into v_is_group from public.conversations where id = p_conversation_id;
  if v_is_group is null or v_is_group then
    -- Group chats aren't restricted by blocking - see this migration's
    -- header comment. A missing conversation row (v_is_group null) isn't
    -- this function's problem to enforce either.
    return true;
  end if;

  select user_id into v_other_id
  from public.conversation_participants
  where conversation_id = p_conversation_id and user_id <> p_sender_id
  limit 1;

  if v_other_id is null then
    return true;
  end if;

  return not exists (
    select 1 from public.blocked_users
    where (blocker_id = v_other_id and blocked_id = p_sender_id)
       or (blocker_id = p_sender_id and blocked_id = v_other_id)
  );
end;
$$;

-- Restrictive (ANDed with the existing "members can send messages as
-- themselves" permissive policy, not OR'd) so this narrows who can send
-- without needing to touch or duplicate that policy's own conditions.
create policy "blocked users cannot message each other"
  on public.messages as restrictive for insert
  with check (public.not_blocked_in_conversation(conversation_id, sender_id));
