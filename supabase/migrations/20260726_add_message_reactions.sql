-- Message reactions (emoji tapbacks), e.g. iMessage/Slack style.
-- conversation_id is denormalized onto this table (rather than joining
-- through messages) so its RLS policies can reuse the same
-- is_conversation_participant() check without an extra join.

create table public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index message_reactions_message_id_idx on public.message_reactions (message_id);
create index message_reactions_conversation_id_idx on public.message_reactions (conversation_id);

alter table public.message_reactions enable row level security;

create policy "reactions are viewable by conversation members"
  on public.message_reactions for select
  to authenticated
  using (public.is_conversation_participant(conversation_id));

create policy "members can react as themselves"
  on public.message_reactions for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_conversation_participant(conversation_id)
  );

create policy "users can remove their own reactions"
  on public.message_reactions for delete
  to authenticated
  using (user_id = (select auth.uid()));

alter publication supabase_realtime add table public.message_reactions;
