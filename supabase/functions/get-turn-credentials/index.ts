import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CF_TURN_KEY_ID = Deno.env.get("CF_TURN_KEY_ID");
const CF_TURN_TOKEN = Deno.env.get("CF_TURN_TOKEN");

// Comfortably longer than any real call, short enough that a leaked
// credential (e.g. from a device that's compromised mid-call) stops
// being usable soon after.
const CREDENTIAL_TTL_SECONDS = 3600;

// Mints short-lived Cloudflare Calls TURN credentials for the caller to
// add to their RTCPeerConnection's iceServers, alongside the free public
// STUN servers CallContext.tsx already falls back to. Needed because a
// long-lived Cloudflare API token can't live in the app itself - anyone
// could pull it out of the client and relay arbitrary traffic through
// the account - so this is the thing that actually holds that secret.
Deno.serve(async (req: Request) => {
  if (!CF_TURN_KEY_ID || !CF_TURN_TOKEN) {
    // Not configured yet - callers fall back to STUN-only, exactly as
    // before this function existed. Not an error: TURN is an upgrade
    // for restrictive networks, not a hard requirement.
    return new Response(JSON.stringify({ iceServers: null }), { status: 200 });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Same "resolve who's asking from their own JWT" pattern as
    // send-call-notification / delete-account - just confirms this is a
    // signed-in user, since TURN credentials aren't tied to a specific
    // conversation the way a call-notification push is.
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

    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${CF_TURN_KEY_ID}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CF_TURN_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS }),
      },
    );

    if (!res.ok) {
      console.error(`Cloudflare TURN credential request failed: ${await res.text()}`);
      return new Response(JSON.stringify({ iceServers: null }), { status: 200 });
    }

    const json = await res.json();
    return new Response(JSON.stringify({ iceServers: json.iceServers }), { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ iceServers: null }), { status: 200 });
  }
});
