-- The avatars bucket was created public (20260729_add_profile_avatars.sql)
-- with an unauthenticated "select ... to public" policy, so anyone on the
-- internet who obtained or guessed a user's UUID (e.g. from search results,
-- or a shared conversation) could fetch that user's profile photo directly
-- and indefinitely, with no login required. Flagged in the mobile security
-- audit (Privacy F3).
--
-- Tightens avatars to the same pattern already used for message-media:
-- private bucket + short-lived signed URLs, with read access scoped to
-- authenticated users rather than the whole internet.

update storage.buckets set public = false where id = 'avatars';

drop policy "avatars are publicly readable" on storage.objects;

create policy "authenticated users can view avatars"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars');
