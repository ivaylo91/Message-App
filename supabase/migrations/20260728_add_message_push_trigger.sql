-- Fires the send-push-notification Edge Function whenever a message is
-- inserted, via pg_net (async HTTP from Postgres).
--
-- The shared webhook secret is NOT in this file - it lives in Supabase
-- Vault (`select vault.create_secret(...)`, run once outside of
-- version control) and must match the WEBHOOK_SECRET Edge Function
-- secret, set separately in the dashboard.

create extension if not exists pg_net;

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
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
    body := jsonb_build_object('record', row_to_json(new))
  );
  return new;
end;
$$;

create trigger on_message_created
  after insert on public.messages
  for each row execute procedure public.notify_new_message();

-- notify_new_message is only ever invoked via the trigger (Postgres'
-- trigger machinery doesn't gate on the invoking role's function-execute
-- grants), so it needs no direct client access. Calling it directly
-- would error anyway (trigger functions require a trigger context for
-- NEW/OLD), but there's no reason to leave it exposed as a callable RPC.
revoke execute on function public.notify_new_message() from public;
revoke execute on function public.notify_new_message() from anon;
revoke execute on function public.notify_new_message() from authenticated;