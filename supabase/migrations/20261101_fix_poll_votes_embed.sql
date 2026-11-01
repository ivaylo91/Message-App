-- poll_votes broke every message load. A table whose primary key is made of
-- two foreign keys is what PostgREST reads as a many-to-many link, so
-- (message_id, user_id) created a second route between messages and profiles.
-- The app's `profiles(...)` embed then had two meanings and failed with
-- PGRST201 (HTTP 300).
--
-- A surrogate key removes the link for every installed app at once, with no
-- release. message_reactions has the same shape for the same reason. The
-- unique constraint keeps one row per person per poll, and cast_poll_vote's
-- `on conflict (message_id, user_id)` resolves against it unchanged.

alter table public.poll_votes add column id uuid not null default gen_random_uuid();

alter table public.poll_votes drop constraint poll_votes_pkey;
alter table public.poll_votes add primary key (id);

alter table public.poll_votes
  add constraint poll_votes_message_id_user_id_key unique (message_id, user_id);

notify pgrst, 'reload schema';
