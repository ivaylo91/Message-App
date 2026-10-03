-- Who a message @mentions, by id.
--
-- The body also carries "@Display Name" as plain text, so it reads right
-- everywhere a body is shown. This column is what the push function
-- trusts: text alone can't say which of two people with the same name was
-- meant. A mention pushes even when the mentioned person has muted the
-- conversation (see send-push-notification), and only ever reaches
-- someone who is actually a participant, since pushes are sent only to
-- the conversation's participants - an id here for anyone else does
-- nothing.
--
-- Defaults to empty, so inserts from builds that predate mentions are
-- unaffected; messages has a table-level INSERT grant, so no grant is
-- needed. Capped so one message can't carry an unbounded list.
alter table public.messages
  add column mentions uuid[] not null default '{}'::uuid[],
  add constraint messages_mentions_limit check (cardinality(mentions) <= 50);
