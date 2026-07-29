-- Generalizes message attachments beyond photos: files (any type) and
-- voice messages. media_path stays the generic storage path column
-- regardless of attachment kind; attachment_type tells the client how
-- to render the row, attachment_name/mime_type are used for file
-- bubbles (icon + filename), attachment_duration_ms for voice note
-- playback UI.

alter table public.messages
  add column attachment_type text check (attachment_type in ('image', 'audio', 'file')),
  add column attachment_name text,
  add column attachment_mime_type text,
  add column attachment_duration_ms integer;

-- Every existing media_path row predates this column and was always
-- a photo share.
update public.messages
set attachment_type = 'image'
where media_path is not null and attachment_type is null;

alter table public.messages
  add constraint messages_attachment_type_matches_media
  check ((media_path is null) = (attachment_type is null));

-- The bucket was scoped to photo mime types only; broaden it to any
-- file type (voice recordings included) now that generic file sharing
-- is supported, and raise the size cap a bit beyond what was tuned
-- for photos.
update storage.buckets
set allowed_mime_types = null,
    file_size_limit = 26214400 -- 25 MB
where id = 'message-media';