-- A device's FCM token is stable across accounts on that device (it's
-- tied to the app install, not the signed-in user). Since
-- registerPushToken() upserts on (user_id, token), switching accounts
-- on the same device previously left the PREVIOUS account's row in
-- place alongside the new one - so both accounts would get pushed to
-- that same physical device, including a user getting notified about
-- their own message (if they'd previously been signed in as the other
-- participant on that same test device).
--
-- RLS on push_tokens correctly scopes a client to only its own rows,
-- so a plain client-side delete can't remove another user's stale row
-- for this token. This SECURITY DEFINER function does exactly that one
-- narrow thing: release any other user's registration for the token
-- the caller is presenting, then claim it for themselves. A caller can
-- only ever affect a token they actually possess (from their own
-- device's FCM registration) and can only ever grant it to themselves.

create or replace function public.claim_push_token(p_token text, p_platform text default 'android')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_tokens
  where token = p_token
    and user_id <> auth.uid();

  insert into public.push_tokens (user_id, token, platform, updated_at)
  values (auth.uid(), p_token, p_platform, now())
  on conflict (user_id, token) do update set updated_at = now();
end;
$$;

revoke execute on function public.claim_push_token(text, text) from public;
grant execute on function public.claim_push_token(text, text) to authenticated;