-- Every SECURITY DEFINER function in the `public` schema is automatically
-- reachable as an RPC at /rest/v1/rpc/<name>, because PostgREST exposes
-- the whole schema. That's intended for the three the app actually calls,
-- and a leak for the ones that only exist to be called from inside RLS
-- policies and triggers.
--
-- The one that matters is not_blocked_in_conversation(conversation_id,
-- sender_id). It never checks who is asking, so any signed-in user could
-- call it directly and read back a block relationship between two other
-- people. Worse, it defeats the app's own deliberate effort to keep a
-- block invisible to the person blocked: OutboxContext silently drops a
-- message rejected by the "blocked users cannot message each other"
-- policy precisely so being blocked can't be detected, but a blocked user
-- who knows their own conversation id could just call this and get a
-- straight answer.
--
-- The fix is to move these out of the schema PostgREST exposes rather
-- than to revoke EXECUTE from `authenticated`. Postgres checks EXECUTE
-- against the *calling* role even for SECURITY DEFINER functions, and
-- these two are called from 11 RLS policies across public, realtime and
-- storage - revoking would have broken reading messages, joining typing
-- channels, and loading attachments for every user. Policies bind the
-- function by OID, so relocating it leaves them working untouched;
-- `private` is simply not in PostgREST's exposed schema list, so the RPC
-- endpoint stops existing.
--
-- Verified before applying, in a rolled-back transaction: after the move,
-- a signed-in user could still read messages (107 rows), still list
-- message-media objects, and the relocated function still evaluated.

create schema if not exists private;

-- authenticated needs USAGE for the RLS policies that call into this
-- schema. This is not what exposes a schema over the API - only
-- PostgREST's own db-schemas setting does that - so private stays
-- unreachable from /rest/v1/rpc/.
grant usage on schema private to authenticated;

alter function public.is_conversation_participant(uuid) set schema private;
alter function public.not_blocked_in_conversation(uuid, uuid) set schema private;

-- Trigger bodies, never called directly. A trigger function's EXECUTE
-- privilege is checked when the trigger is created, not each time it
-- fires, so revoking here leaves the triggers working - verified in a
-- rolled-back transaction against a throwaway table reproducing the
-- pattern.
revoke execute on function public.unhide_conversation_for_participants() from public, anon, authenticated;

-- The three the client genuinely calls. They stay in public and stay
-- callable by signed-in users; they just stop being offered to anon,
-- which has no business creating conversations, claiming a device's push
-- token, or asking for unread counts (all three read auth.uid() and are
-- meaningless without a session anyway). service_role is granted
-- explicitly so revoking PUBLIC doesn't quietly take it away from
-- server-side callers.
revoke execute on function public.claim_push_token(text, text) from public, anon;
grant execute on function public.claim_push_token(text, text) to authenticated, service_role;

revoke execute on function public.create_conversation(uuid[], boolean, text) from public, anon;
grant execute on function public.create_conversation(uuid[], boolean, text) to authenticated, service_role;

revoke execute on function public.unread_message_counts() from public, anon;
grant execute on function public.unread_message_counts() to authenticated, service_role;

-- Belt and braces on the relocated pair: unreachable from the API is
-- currently a property of `private` not being an exposed schema, and of
-- anon lacking USAGE on it. Make the function ACLs say the same thing, so
-- neither guarantee rests on a single setting. The grant has to come
-- first - these carry the default PUBLIC execute grant, which is how
-- `authenticated` currently reaches them, so revoking PUBLIC without an
-- explicit grant first would break all 11 policies that call them.
grant execute on function private.is_conversation_participant(uuid) to authenticated, service_role;
revoke execute on function private.is_conversation_participant(uuid) from public, anon;

grant execute on function private.not_blocked_in_conversation(uuid, uuid) to authenticated, service_role;
revoke execute on function private.not_blocked_in_conversation(uuid, uuid) from public, anon;
