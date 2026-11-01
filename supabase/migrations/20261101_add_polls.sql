-- Polls. A poll is a message: its body is the question and its choices sit on
-- the row, so replies, pinning, saving, search, the chat list and push
-- notifications all work without knowing polls exist, and an app from before
-- this shows the question as an ordinary message.

alter table public.messages add column poll_options text[];

alter table public.messages
  add constraint messages_poll_options_check
  check (
    poll_options is null
    or (
      body is not null
      and cardinality(poll_options) between 2 and 10
      and array_position(poll_options, null) is null
      and '' <> all (poll_options)
      and char_length(array_to_string(poll_options, '')) <= 1000
    )
  );

-- One row per person per poll. Votes change and get withdrawn by updating the
-- row, never deleting it: Realtime can't filter a delete by conversation, and
-- every other change here has to reach the people watching this chat.
create table public.poll_votes (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  -- Into messages.poll_options, counting from 0. Null once withdrawn.
  option_index integer,
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index poll_votes_conversation_id_idx on public.poll_votes (conversation_id);
create index poll_votes_user_id_idx on public.poll_votes (user_id);

alter table public.poll_votes enable row level security;
revoke all on public.poll_votes from anon, authenticated;
grant select on public.poll_votes to authenticated;

create policy "poll votes are viewable by conversation members"
  on public.poll_votes for select to authenticated
  using (private.is_conversation_participant(conversation_id));

-- Written only through here, because whether a vote is valid depends on the
-- poll's own row: that it's still there, and that the choice is one of its.
create function public.cast_poll_vote(p_message_id uuid, p_option_index integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation_id uuid;
  v_options text[];
begin
  select conversation_id, poll_options
  into v_conversation_id, v_options
  from public.messages
  where id = p_message_id and deleted_at is null;

  if v_options is null or not private.is_conversation_participant(v_conversation_id) then
    raise exception 'This poll is not available';
  end if;

  if p_option_index is not null
    and (p_option_index < 0 or p_option_index >= cardinality(v_options)) then
    raise exception 'That choice is not in this poll';
  end if;

  insert into public.poll_votes (message_id, user_id, conversation_id, option_index)
  values (p_message_id, auth.uid(), v_conversation_id, p_option_index)
  on conflict (message_id, user_id) do update
    set option_index = excluded.option_index,
        updated_at = now();
end;
$$;

revoke execute on function public.cast_poll_vote(uuid, integer) from public, anon;
grant execute on function public.cast_poll_vote(uuid, integer) to authenticated;

alter publication supabase_realtime add table public.poll_votes;
