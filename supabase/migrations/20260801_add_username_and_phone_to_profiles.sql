-- Lets people find each other by @username or phone number, in addition
-- to today's name/email search. Both are optional and self-service
-- editable, same column-level grant pattern as avatar_path/display_name
-- (see 20260729_add_profile_avatars.sql).

alter table public.profiles
  add column username text,
  add column phone text;

-- Partial (not full) unique indexes: many rows will leave these null
-- since they're optional, and null <> null so a plain unique index
-- would already allow that - the "where not null" just makes the
-- intent explicit and skips indexing the (often-majority) null rows.
create unique index profiles_username_key
  on public.profiles (lower(username))
  where username is not null;

create unique index profiles_phone_key
  on public.profiles (phone)
  where phone is not null;

revoke update on public.profiles from authenticated;
grant update (display_name, avatar_path, username, phone) on public.profiles to authenticated;
