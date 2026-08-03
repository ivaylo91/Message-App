-- messages_body_or_media_check (added before attachments existed further,
-- widened for images/audio/files) never accounted for a message that's
-- neither text nor an attachment - a call-log row (see
-- 20260809_add_call_log_messages.sql) has both body and media_path null,
-- so it silently failed this constraint on insert.
alter table public.messages drop constraint messages_body_or_media_check;

alter table public.messages
  add constraint messages_body_or_media_or_call_check
  check (body is not null or media_path is not null or call_status is not null);
