-- Per-user mute. Nullable rather than a boolean so "mute for 8 hours" and
-- "mute until I say otherwise" are the same mechanism: null means not
-- muted, a future timestamp means muted until then, and a past one has
-- simply expired - no scheduled job needed to un-mute anything.
--
-- "Always" is stored as a far-future timestamp rather than a separate flag
-- or infinity, so every read is the same comparison.
--
-- Muting is per participant, not per conversation: the other people in a
-- group carry on being notified normally.
alter table public.conversation_participants
  add column muted_until timestamptz;

-- Same shape as last_read_at and hidden_at: a column-level grant, with the
-- existing "members can update their own last_read_at" policy (which keys
-- on user_id = auth.uid()) already restricting it to your own row.
grant update (muted_until) on public.conversation_participants to authenticated;

comment on column public.conversation_participants.muted_until is
  'Null = not muted. A future timestamp mutes push notifications until it passes; the app writes a far-future value for "always". Enforced in send-push-notification, which filters muted recipients before sending.';
