import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FIREBASE_SERVICE_ACCOUNT = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");

interface ServiceAccount {
  project_id: string;
  private_key: string;
  client_email: string;
}

function base64UrlEncode(data: ArrayBuffer | string): string {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(claims),
  )}`;

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${base64UrlEncode(signature)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(`Failed to get FCM access token: ${JSON.stringify(tokenJson)}`);
  }
  return tokenJson.access_token as string;
}

// Data-only (no `notification` key) - the client must display this itself
// via notifee as a full-screen-intent notification so it can ring/wake the
// device even from background/killed, unlike a plain FCM `notification`
// payload which Android would just drop into the shade quietly.
async function sendFcmDataMessage(
  accessToken: string,
  projectId: string,
  token: string,
  data: Record<string, string>,
): Promise<void> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          data,
          android: { priority: "high" },
        },
      }),
    },
  );
  if (!res.ok) {
    console.error(`FCM call-push send failed for a token: ${await res.text()}`);
  }
}

Deno.serve(async (req: Request) => {
  if (!FIREBASE_SERVICE_ACCOUNT) {
    console.error("FIREBASE_SERVICE_ACCOUNT secret is not set - skipping call push");
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Runs as the caller, not the service role, purely to resolve who the
    // caller actually is from their JWT - RLS on conversation_participants
    // still applies to this client, which is what makes the participant
    // check below meaningful rather than just trusting the request body.
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

    const { conversationId, calleeUserId } = await req.json();
    if (!conversationId || !calleeUserId) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    // Confirms the caller is actually a participant of this conversation -
    // without this, any signed-in user could ring any other user's device
    // by guessing/enumerating conversation and user ids.
    const { data: callerMembership, error: membershipError } = await callerClient
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!callerMembership) {
      return new Response("Forbidden", { status: 403 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: calleeMembership, error: calleeMembershipError } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", calleeUserId)
      .maybeSingle();
    if (calleeMembershipError) throw calleeMembershipError;
    if (!calleeMembership) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const { data: tokens, error: tokensError } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", calleeUserId);
    if (tokensError) throw tokensError;
    if (!tokens?.length) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const { data: caller } = await supabase
      .from("profiles")
      .select("display_name, avatar_path")
      .eq("id", user.id)
      .single();

    const serviceAccount: ServiceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
    const accessToken = await getAccessToken(serviceAccount);

    await Promise.all(
      tokens.map((t: { token: string }) =>
        sendFcmDataMessage(accessToken, serviceAccount.project_id, t.token, {
          type: "call",
          conversationId,
          callerId: user.id,
          callerName: caller?.display_name ?? "Someone",
          callerAvatarPath: caller?.avatar_path ?? "",
        }),
      ),
    );

    return new Response(JSON.stringify({ sent: tokens.length }), { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
