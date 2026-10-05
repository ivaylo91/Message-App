import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { type LinkPreview, parseFetchableUrl } from "./preview.ts";
import { fetchPreview } from "./fetch.ts";

// Title, description and site name for a URL in a message, fetched here
// rather than on the phone so a viewer's device never contacts the
// linked site just by scrolling past a message.
//
// Fetching an arbitrary URL from inside the provider's network is the
// classic server-side request forgery setup, so every hop is checked:
// the hostname must resolve only to public addresses (preview.ts), and
// redirects are followed by hand so each new location is checked the
// same way (fetch.ts). Time, size and content type are capped.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_URL_LENGTH = 2048;

const createServiceClient = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// The gateway has already verified the token (verify_jwt), so reading its
// claims is safe. Signed-in users only - the public anon key is in every
// copy of the app, so accepting it would open this to anyone.
function isSignedInUser(req: Request): boolean {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const payload = token?.split(".")[1];
  if (!payload) return false;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return claims.role === "authenticated";
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!isSignedInUser(req)) return json({ error: "forbidden" }, 403);

  let raw: unknown;
  try {
    raw = (await req.json())?.url;
  } catch {
    return json({ error: "bad request" }, 400);
  }
  if (typeof raw !== "string" || raw.length > MAX_URL_LENGTH) {
    return json({ error: "bad request" }, 400);
  }
  const url = parseFetchableUrl(raw);
  if (!url) return json({ preview: null });
  url.hash = "";
  const key = url.toString();

  const supabase = createServiceClient();
  const { data: cached } = await supabase
    .from("link_previews")
    .select("title, description, site_name, fetched_at")
    .eq("url", key)
    .maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
    return json({
      preview: cached.title
        ? { url: key, title: cached.title, description: cached.description, siteName: cached.site_name }
        : null,
    });
  }

  let preview: LinkPreview | null = null;
  try {
    preview = await fetchPreview(url);
  } catch {
    // Timeout, refused connection, TLS failure - all just "no preview".
  }
  const usable = preview?.title ? preview : null;

  // Cached even when there's nothing to show, so a dead or metadata-less
  // link isn't refetched every time someone scrolls past it.
  await supabase.from("link_previews").upsert({
    url: key,
    title: usable?.title ?? null,
    description: usable?.description ?? null,
    site_name: usable?.siteName ?? null,
    fetched_at: new Date().toISOString(),
  });

  return json({ preview: usable });
});
