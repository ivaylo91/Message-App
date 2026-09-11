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
      // Data-only: no `notification` block. A payload carrying one is
      // rendered by Android before any JS runs, which is simpler and more
      // robust, but it cannot carry an inline Reply action - only a
      // notification the app builds itself can. So the title and body ride
      // along as data and the client renders them (displayMessageNotification
      // in mobile/src/notifications/index.ts), which is also what the call
      // notifications have always done.
      //
      // The trade-off is real: this now depends on the app's background
      // handler running. High-priority data messages wake it, and calls have
      // relied on that all along.
      //
      // This also supersedes the android.notification.channel_id set here
      // previously - with no notification block for Firebase to render, the
      // channel is chosen by notifee on the client instead.
      body: JSON.stringify({
        message: {
          token,
          data: { ...data, title, body },
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

// Shared by both kinds of push. Returns how many tokens were sent to.
async function pushToUsers(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<number> {
  if (!userIds.length) return 0;

  const { data: tokens, error } = await supabase
    .from("push_tokens")
    .select("token")
    .in("user_id", userIds);
  if (error) throw error;
  if (!tokens?.length) return 0;

  const serviceAccount: ServiceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT!);
  const accessToken = await getAccessToken(serviceAccount);

  await Promise.all(
    tokens.map((t: { token: string }) =>
      sendFcmMessage(accessToken, serviceAccount.project_id, t.token, title, body, data),
    ),
  );
  return tokens.length;
}

// Not muted, or the mute has expired - the same rule the message path uses.
function notMuted(mutedUntil: string | null, now: number): boolean {
  if (!mutedUntil) return true;
  const until = new Date(mutedUntil).getTime();
  return Number.isNaN(until) || until <= now;
}

// Someone reacted to a message: notify only its author. Deliberately not
// everyone in the conversation - a reaction concerns the person whose
// message it was.
async function handleReaction(
  supabase: ReturnType<typeof createClient>,
  reaction: {
    message_id: string;
    conversation_id: string;
    user_id: string;
    emoji: string;
  },
): Promise<Response> {
  const { data: message } = await supabase
    .from("messages")
    .select("sender_id, deleted_at")
    .eq("id", reaction.message_id)
    .single();

  // Reacting to your own message should not buzz your own phone, and a
  // deleted message has nothing left to react to.
  if (!message || message.deleted_at || message.sender_id === reaction.user_id) {
    return new Response(JSON.stringify({ skipped: true, reason: "no recipient" }), {
      status: 200,
    });
  }

  const { data: participant } = await supabase
    .from("conversation_participants")
    .select("muted_until")
    .eq("conversation_id", reaction.conversation_id)
    .eq("user_id", message.sender_id)
    .single();

  // Muting a conversation mutes its reactions too - being woken by a thumbs
  // up on a muted thread is exactly what mute is for.
  if (!participant || !notMuted(participant.muted_until, Date.now())) {
    return new Response(JSON.stringify({ skipped: true, reason: "muted" }), {
      status: 200,
    });
  }

  const { data: reactor } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", reaction.user_id)
    .single();

  // The emoji is the entire content of the notification - without it there
  // is nothing to say - and it reveals far less than message text would.
  const sent = await pushToUsers(
    supabase,
    [message.sender_id],
    reactor?.display_name ?? "Someone",
    `Reacted ${reaction.emoji} to your message`,
    { conversationId: reaction.conversation_id, type: "reaction" },
  );

  return new Response(JSON.stringify({ sent }), { status: 200 });
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
    const supabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // The reaction trigger posts { reaction: ... }; the message trigger
    // posts { record: ... }. Branching on the key keeps both kinds sharing
    // the FCM credentials and JWT signing above.
    if (payload.reaction) {
      return await handleReaction(supabaseClient, payload.reaction);
    }

    const message = payload.record;

    if (!message?.conversation_id || !message?.sender_id) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const supabase = supabaseClient;

    const { data: participants, error: participantsError } = await supabase
      .from("conversation_participants")
      .select("user_id, muted_until")
      .eq("conversation_id", message.conversation_id)
      .neq("user_id", message.sender_id);
    if (participantsError) throw participantsError;
    if (!participants?.length) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    // Mute is enforced here rather than on the client: the point is not to
    // be woken, so the push must not be sent at all. An expired mute is
    // indistinguishable from no mute, which is why nothing has to clear
    // old values. Muting is per participant - everyone else in a group
    // still gets notified.
    const now = Date.now();
    const recipientIds = participants
      .filter((p: { muted_until: string | null }) => notMuted(p.muted_until, now))
      .map((p: { user_id: string }) => p.user_id);

    if (!recipientIds.length) {
      return new Response(JSON.stringify({ skipped: true, reason: "all muted" }), {
        status: 200,
      });
    }

    const { data: sender } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", message.sender_id)
      .single();

    const sent = await pushToUsers(
      supabase,
      recipientIds,
      sender?.display_name ?? "New message",
      genericBodyFor(message),
      { conversationId: message.conversation_id, type: "message" },
    );

    return new Response(JSON.stringify({ sent }), { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
