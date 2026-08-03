import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FIREBASE_SERVICE_ACCOUNT = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

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

async function sendFcmMessage(
  accessToken: string,
  projectId: string,
  token: string,
  title: string,
  body: string,
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
          notification: { title, body },
          data,
          android: { priority: "high" },
        },
      }),
    },
  );
  if (!res.ok) {
    console.error(`FCM send failed for a token: ${await res.text()}`);
  }
}

// Deliberately generic, regardless of attachment type - the actual
// message text (or an attachment's filename, which can be just as
// revealing) never leaves the server. A push notification is commonly
// visible on a locked device before anyone has authenticated, so this
// is the one place in the app that can't rely on "the user is signed
// in" as a privacy boundary.
function genericBodyFor(message: { attachment_type?: string | null }): string {
  switch (message.attachment_type) {
    case "image":
      return "📷 Sent a photo";
    case "audio":
      return "🎤 Sent a voice message";
    case "file":
      return "📎 Sent a file";
    default:
      return "Sent you a message";
  }
}

Deno.serve(async (req: Request) => {
  if (WEBHOOK_SECRET && req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!FIREBASE_SERVICE_ACCOUNT) {
    console.error("FIREBASE_SERVICE_ACCOUNT secret is not set - skipping push send");
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }

  try {
    const payload = await req.json();
    const message = payload.record;

    if (!message?.conversation_id || !message?.sender_id) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: participants, error: participantsError } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", message.conversation_id)
      .neq("user_id", message.sender_id);
    if (participantsError) throw participantsError;
    if (!participants?.length) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const recipientIds = participants.map((p: { user_id: string }) => p.user_id);

    const { data: tokens, error: tokensError } = await supabase
      .from("push_tokens")
      .select("token")
      .in("user_id", recipientIds);
    if (tokensError) throw tokensError;
    if (!tokens?.length) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const { data: sender } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", message.sender_id)
      .single();

    const title = sender?.display_name ?? "New message";
    const body = genericBodyFor(message);

    const serviceAccount: ServiceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
    const accessToken = await getAccessToken(serviceAccount);

    await Promise.all(
      tokens.map((t: { token: string }) =>
        sendFcmMessage(accessToken, serviceAccount.project_id, t.token, title, body, {
          conversationId: message.conversation_id,
        }),
      ),
    );

    return new Response(JSON.stringify({ sent: tokens.length }), { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
