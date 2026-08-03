-- Video calls are signaled entirely over realtime broadcast (see
-- CallContext.tsx) and never touch the messages table while in
-- progress - but once a call ends, the caller writes a single summary
-- row here so it shows up in the chat transcript and conversation
-- list preview, the same way WhatsApp/Messenger log calls.
--
-- Deliberately a separate column rather than another attachment_type
-- value: attachment_type is constrained to always come with a
-- media_path (messages_attachment_type_matches_media), and a call log
-- entry has no media at all. attachment_duration_ms is reused for a
-- completed call's duration - the concept ("how long this took")
-- already fits, no need for a parallel column.
alter table public.messages
  add column call_status text check (call_status in ('missed', 'declined', 'completed'));
