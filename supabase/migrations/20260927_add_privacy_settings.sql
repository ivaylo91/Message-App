-- Let people hide their read receipts and their last-seen time.
--
-- Both are enforced here rather than in the app. profiles and
-- conversation_participants are granted SELECT at table level, so every
-- column is readable by anyone the row policies admit; an app that merely
-- stopped *displaying* a value would still leave it one API call away.
-- Instead, the server stops holding the shareable value at all while the
-- setting is off.

alter table public.profiles
  add column show_read_receipts boolean not null default true,
  add column show_last_seen boolean not null default true;

-- UPDATE on profiles is granted per column; the existing row policy
-- already limits it to the user's own row.
grant update (show_read_receipts, show_last_seen) on public.profiles to authenticated;


-- ---------------------------------------------------------------------
-- Last seen
-- ---------------------------------------------------------------------

-- While hidden, last_seen_at is always null - whatever a client writes.
-- Nobody needs their own last-seen time, so nothing is lost by not
-- keeping it; it starts again from the next heartbeat after re-enabling.
create function private.apply_last_seen_privacy()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if not new.show_last_seen then
    new.last_seen_at := null;
  end if;
  return new;
end;
$$;

revoke execute on function private.apply_last_seen_privacy() from public, anon, authenticated;

create trigger apply_last_seen_privacy
  before insert or update on public.profiles
  for each row execute function private.apply_last_seen_privacy();

update public.profiles set last_seen_at = null where not show_last_seen;


-- ---------------------------------------------------------------------
-- Read receipts
-- ---------------------------------------------------------------------

-- last_read_at did two jobs: it is what other participants read to show
-- "seen", and it is what unread_message_counts measures from. Hiding the
-- first must not break the second, so the real read position moves here,
-- in the private schema, which the API does not expose - and
-- last_read_at is left as purely the shared receipt.
--
-- Clients keep writing last_read_at exactly as before (including builds
-- already installed); the trigger below copies each write here first.
create table private.read_positions (
  conversation_id uuid not null,
  user_id uuid not null,
  read_at timestamptz not null,
  primary key (conversation_id, user_id),
  -- Deferred: the trigger records a position while the participant row
  -- it belongs to is still being inserted. Cascading means leaving (or
  -- being removed from) a conversation drops the position with it, so
  -- someone re-added later doesn't inherit a stale one.
  foreign key (conversation_id, user_id)
    references public.conversation_participants (conversation_id, user_id)
    on delete cascade
    deferrable initially deferred
);

revoke all on private.read_positions from public, anon, authenticated;

insert into private.read_positions (conversation_id, user_id, read_at)
select conversation_id, user_id, last_read_at
from public.conversation_participants
where last_read_at is not null;

-- SECURITY DEFINER: it writes private.read_positions and reads the
-- owner's setting on behalf of whoever is marking the conversation read.
create function private.apply_read_receipt_privacy()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  shares boolean;
begin
  if new.last_read_at is not null then
    insert into private.read_positions (conversation_id, user_id, read_at)
    values (new.conversation_id, new.user_id, new.last_read_at)
    on conflict (conversation_id, user_id) do update set read_at = excluded.read_at;
  end if;

  select p.show_read_receipts into shares
  from public.profiles p
  where p.id = new.user_id;

  if not coalesce(shares, true) then
    new.last_read_at := null;
  end if;
  return new;
end;
$$;

revoke execute on function private.apply_read_receipt_privacy() from public, anon, authenticated;

create trigger apply_read_receipt_privacy
  before insert or update of last_read_at on public.conversation_participants
  for each row execute function private.apply_read_receipt_privacy();

-- Flipping the setting applies to history too, not just future reads:
-- turning receipts off clears what others can already see, and turning
-- them back on restores the real position rather than waiting for the
-- next read. Each row update goes back through the trigger above, and
-- conversation_participants is in the realtime publication, so open
-- chats on other devices update live.
create function private.sync_read_receipts_setting()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.show_read_receipts then
    update public.conversation_participants cp
    set last_read_at = rp.read_at
    from private.read_positions rp
    where rp.conversation_id = cp.conversation_id
      and rp.user_id = cp.user_id
      and cp.user_id = new.id;
  else
    update public.conversation_participants
    set last_read_at = null
    where user_id = new.id
      and last_read_at is not null;
  end if;
  return null;
end;
$$;

revoke execute on function private.sync_read_receipts_setting() from public, anon, authenticated;

create trigger sync_read_receipts_setting
  after update of show_read_receipts on public.profiles
  for each row
  when (old.show_read_receipts is distinct from new.show_read_receipts)
  execute function private.sync_read_receipts_setting();

-- Unread counts now measure from the private position. The fallback to
-- last_read_at only matters for a row written before this migration that
-- somehow missed the backfill; it is never wrong, merely redundant.
create or replace function public.unread_message_counts()
returns table(conversation_id uuid, unread_count bigint)
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
  left join private.read_positions rp
    on rp.conversation_id = cp.conversation_id
   and rp.user_id = cp.user_id
  where m.sender_id <> (select auth.uid())
    and m.deleted_at is null
    and m.created_at > coalesce(rp.read_at, cp.last_read_at, 'epoch'::timestamptz)
  group by m.conversation_id;
$$;
