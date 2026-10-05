import { extractPreview, isBlockedAddress, type LinkPreview, parseFetchableUrl } from "./preview.ts";

// The network side of link previews: resolve, check, fetch, follow
// redirects by hand. See index.ts for why every hop is checked. Pages and
// images go through the same fetchChecked, so neither can take a route
// around the checks the other has.

const FETCH_TIMEOUT_MS = 5000;
// Metadata lives in <head>; nothing past this is needed.
const MAX_HTML_BYTES = 256 * 1024;
// Preview images are thumbnails; anything bigger isn't one.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

const HTML_TYPE = /^\s*(text\/html|application\/xhtml\+xml)\b/i;
// Raster formats only. SVG is deliberately excluded: it's a document that
// can carry script, not a picture.
const IMAGE_TYPE = /^\s*image\/(png|jpeg|gif|webp)\b/i;

// Every address the hostname resolves to must be public. Fails closed: no
// answer, or a resolver that isn't available, means no fetch.
export async function resolvesOnlyToPublic(hostname: string): Promise<boolean> {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.startsWith("[")) {
    return !isBlockedAddress(hostname);
  }
  const answers = await Promise.allSettled([
    Deno.resolveDns(hostname, "A"),
    Deno.resolveDns(hostname, "AAAA"),
  ]);
  const addresses = answers.flatMap((a) => (a.status === "fulfilled" ? a.value : []));
  return addresses.length > 0 && addresses.every((address) => !isBlockedAddress(address));
}

// Fetches `start`, following redirects by hand so every hop's address is
// checked, and returns the final response only if its content type is
// `allowedType`. Null for anything else; the body of a rejected response
// is always released.
async function fetchChecked(start: URL, accept: string, allowedType: RegExp): Promise<Response | null> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await resolvesOnlyToPublic(url.hostname))) return null;
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "HearthLinkPreview/1.0", Accept: accept },
    });

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => {});
      const location = response.headers.get("location");
      const next = location ? parseFetchableUrl(new URL(location, url).toString()) : null;
      if (!next) return null;
      url = next;
      continue;
    }

    if (!response.ok || !allowedType.test(response.headers.get("content-type") ?? "")) {
      await response.body?.cancel().catch(() => {});
      return null;
    }
    return response;
  }
  return null;
}

// Reads at most `max` bytes. `truncated` says whether there was more.
async function readCapped(response: Response, max: number): Promise<{ bytes: Uint8Array<ArrayBuffer>; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) return { bytes: new Uint8Array(0), truncated: false };
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (total + value.length > max) {
      chunks.push(value.subarray(0, max - total));
      total = max;
      truncated = true;
      break;
    }
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => {});
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { bytes, truncated };
}

export async function fetchPreview(start: URL): Promise<LinkPreview | null> {
  const response = await fetchChecked(start, "text/html,application/xhtml+xml", HTML_TYPE);
  if (!response) return null;
  // A cut-off page is fine: the metadata is at the top.
  const { bytes } = await readCapped(response, MAX_HTML_BYTES);
  return extractPreview(new TextDecoder("utf-8", { fatal: false }).decode(bytes), start.toString());
}

export async function fetchImage(url: URL): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string } | null> {
  const response = await fetchChecked(url, "image/png,image/jpeg,image/gif,image/webp", IMAGE_TYPE);
  if (!response) return null;
  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  const { bytes, truncated } = await readCapped(response, MAX_IMAGE_BYTES);
  // A cut-off image is a broken image - too big to be a thumbnail anyway.
  return truncated ? null : { bytes, contentType };
}
