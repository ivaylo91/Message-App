import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const AVATAR_BUCKET = "avatars";

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Runs as the caller purely to resolve who's asking from their own
    // JWT - same pattern as send-call-notification, so nobody can pass an
    // arbitrary user id in the body and have it acted on.
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();
    if (userError || !user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Storage objects aren't foreign-keyed to the row being deleted below,
    // so they won't get cleaned up by any DB-level cascade - remove them
    // explicitly before the account itself goes away.
    const { data: avatarFiles } = await admin.storage
      .from(AVATAR_BUCKET)
      .list(user.id);
    if (avatarFiles?.length) {
      await admin.storage
        .from(AVATAR_BUCKET)
        .remove(avatarFiles.map((f) => `${user.id}/${f.name}`));
    }

    // Deletes the auth.users row. profiles.id references it with `on
    // delete cascade`, and everything else (conversation_participants,
    // push_tokens, messages, message_reactions, ...) cascades from
    // profiles.id the same way - see e.g. 20260726_add_message_reactions.sql
    // and 20260728_add_push_tokens.sql for the pattern - so this one call
    // removes the rest of the account's data too.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    return new Response(JSON.stringify({ deleted: true }), { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
