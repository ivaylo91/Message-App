-- Media sharing: messages can carry an image instead of (or alongside)
-- text. Images live in a private "message-media" storage bucket,
-- keyed by conversation_id/uuid.ext so storage RLS can reuse
-- is_conversation_participant() the same way the table RLS does.

alter table public.messages alter column body drop not null;
alter table public.messages add column media_path text;
alter table public.messages
  add constraint messages_body_or_media_check
  check (body is not null or media_path is not null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-media',
  'message-media',
  false,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy "participants can view media"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'message-media'
    and public.is_conversation_participant(((storage.foldername(name))[1])::uuid)
  );

create policy "participants can upload media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-media'
    and public.is_conversation_participant(((storage.foldername(name))[1])::uuid)
  );