import { extractPreview, isBlockedAddress, type LinkPreview, parseFetchableUrl } from "./preview.ts";

// The network side of link previews: resolve, check, fetch, follow
// redirects by hand. See index.ts for why every hop is checked.

const FETCH_TIMEOUT_MS = 5000;
// Metadata lives in <head>; nothing past this is needed.
const MAX_HTML_BYTES = 256 * 1024;
const MAX_REDIRECTS = 3;

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

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => {});
  const bytes = new Uint8Array(Math.min(total, MAX_HTML_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.length, bytes.length - offset);
    bytes.set(chunk.subarray(0, take), offset);
    offset += take;
    if (offset >= bytes.length) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export async function fetchPreview(start: URL): Promise<LinkPreview | null> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await resolvesOnlyToPublic(url.hostname))) return null;
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "HearthLinkPreview/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => {});
      const location = response.headers.get("location");
      const next = location ? parseFetchableUrl(new URL(location, url).toString()) : null;
      if (!next) return null;
      url = next;
      continue;
    }

    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !/text\/html|application\/xhtml\+xml/i.test(type)) {
      await response.body?.cancel().catch(() => {});
      return null;
    }
    return extractPreview(await readCapped(response), start.toString());
  }
  return null;
}
