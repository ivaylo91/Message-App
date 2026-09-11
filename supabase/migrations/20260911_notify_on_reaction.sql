-- Push the author of a message when someone reacts to it.
--
-- Deliberately narrower than the message trigger: a reaction notifies only
-- the person whose message was reacted to, not everyone in the
-- conversation. Whether the author should actually be pushed (are they
-- the reactor? have they muted the conversation?) is decided in the Edge
-- Function, which already has the message row and the participant row to
-- hand - doing it here would mean duplicating those lookups in plpgsql.
--
-- INSERT only. Removing a reaction is not an event worth waking anyone
-- for, and re-notifying on every toggle would make the feature unusable.
--
-- Same shape as notify_new_message: the shared secret comes from Vault so
-- it is never written into the function body, and the payload uses a
-- `reaction` key so the Edge Function can tell the two kinds apart.
create or replace function public.notify_new_reaction()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  webhook_secret text;
begin
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'webhook_secret';

  perform net.http_post(
    url := 'https://ejtskxnoyuvmzhpwkvsu.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object('reaction', row_to_json(new))
  );
  return new;
end;
$$;

-- Trigger bodies are never called directly; EXECUTE is checked when the
-- trigger is created, not each time it fires, so revoking here is safe and
-- keeps it off /rest/v1/rpc/ (see 20260909_hide_internal_functions_from_rest_api.sql).
revoke execute on function public.notify_new_reaction() from public, anon, authenticated;

create trigger on_reaction_created
  after insert on public.message_reactions
  for each row execute function public.notify_new_reaction();
