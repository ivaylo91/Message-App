-- Profile pictures: adds an avatar_path column plus a public storage
-- bucket for them. Avatars are shown to anyone a user chats with, so
-- (unlike message-media) the bucket is public - no signed URLs needed
-- to render them - but writes are scoped to the user's own folder.
--
-- Also tightens the existing "users can update own profile" grant:
-- it previously allowed updating email/created_at/id (never used by
-- the app, just never narrowed), which doesn't match the column-level
-- grant pattern used elsewhere (message edit/delete, read receipts).
-- Narrowed to exactly the columns a user should be able to change.

alter table public.profiles add column avatar_path text;

revoke update on public.profiles from authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "avatars are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

create policy "users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "users can update their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "users can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );