// The parts of link previews that make decisions - which addresses may be
// fetched, and what a page's metadata says - kept free of network I/O so
// they can be tested directly (preview_test.ts).

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  // The page's own preview image (og:image), made absolute. Never loaded
  // by the phone directly - see the image route in index.ts.
  imageUrl: string | null;
}

// Only ordinary web URLs. No credentials in the URL (they'd be sent to the
// site on a stranger's behalf) and no non-default ports, which are how a
// fetcher gets aimed at services that aren't websites.
export function parseFetchableUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  return url;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const v = Number(part);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

// [network, prefix length]
const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata at 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // protocol assignments
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. broadcast
];

// The eight 16-bit groups of an IPv6 address, or null if it isn't one.
// Worked out numerically because the same address has many spellings, and
// the URL parser picks one nobody would look for: [::ffff:169.254.169.254]
// reaches here as ::ffff:a9fe:a9fe.
function ipv6Groups(address: string): number[] | null {
  let text = address;
  // A dotted tail (::ffff:1.2.3.4) is two groups written differently.
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const v4 = ipv4ToInt(dotted[2]);
    if (v4 === null) return null;
    text = `${dotted[1]}${Math.floor(v4 / 65536).toString(16)}:${(v4 % 65536).toString(16)}`;
  }
  const sides = text.split("::");
  if (sides.length > 2) return null;
  const head = sides[0] ? sides[0].split(":") : [];
  const tail = sides[1] ? sides[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (sides.length === 1 ? missing !== 0 : missing < 1) return null;
  const parts = [...head, ...Array(missing).fill("0"), ...tail];
  if (!parts.every((part) => /^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.map((part) => parseInt(part, 16));
}

function isBlockedEmbeddedV4(high: number, low: number): boolean {
  return isBlockedAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
}

function isBlockedIpv6(address: string): boolean {
  const groups = ipv6Groups(address);
  if (!groups) return true; // neither form - refuse rather than guess
  const [a, b, c, d, e, f, g, h] = groups;
  const firstFiveZero = a === 0 && b === 0 && c === 0 && d === 0 && e === 0;

  // ::/96 - unspecified, loopback and the old IPv4-compatible form.
  if (firstFiveZero && f === 0) return true;
  // ::ffff:0:0/96 - IPv4-mapped, which reaches the IPv4 address itself.
  if (firstFiveZero && f === 0xffff) return isBlockedEmbeddedV4(g, h);
  // 64:ff9b::/96 - NAT64 and 2002::/16 - 6to4 both carry an IPv4 address.
  if (a === 0x64 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0) {
    return isBlockedEmbeddedV4(g, h);
  }
  if (a === 0x2002) return isBlockedEmbeddedV4(b, c);
  if (a === 0x2001 && b === 0) return true; // 2001::/32 Teredo tunnelling
  if (a === 0x2001 && b === 0xdb8) return true; // 2001:db8::/32 documentation
  if (a === 0x100 && b === 0 && c === 0 && d === 0) return true; // 100::/64 discard
  if ((a & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((a & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((a & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local
  if ((a & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

// True for any address that isn't on the public internet - where a
// preview fetch must never go, since the function runs inside the
// provider's network.
export function isBlockedAddress(address: string): boolean {
  const v4 = ipv4ToInt(address);
  if (v4 !== null) {
    return BLOCKED_V4.some(([net, bits]) => {
      const base = ipv4ToInt(net)!;
      const size = 2 ** (32 - bits);
      return v4 >= base && v4 < base + size;
    });
  }
  const v6 = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (!v6.includes(":")) return true; // neither form - refuse rather than guess
  return isBlockedIpv6(v6);
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

function clean(value: string | undefined, max: number): string | null {
  if (!value) return null;
  const text = decodeEntities(value).replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

// Reads Open Graph / Twitter / standard metadata out of a page's HTML.
// Regex rather than a DOM parser: only <meta> and <title> matter, and the
// attributes come in either order.
export function extractPreview(html: string, url: string): LinkPreview {
  const meta: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag.match(/\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i);
    const value = content?.[1] ?? content?.[2];
    if (key && value !== undefined && !(key in meta)) meta[key] = value;
  }
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const rawImage = meta["og:image:secure_url"] ?? meta["og:image"] ?? meta["twitter:image"];

  return {
    url,
    title: clean(meta["og:title"] ?? meta["twitter:title"] ?? titleTag, 120),
    description: clean(
      meta["og:description"] ?? meta["twitter:description"] ?? meta["description"],
      200,
    ),
    siteName: clean(meta["og:site_name"], 60),
    imageUrl: resolveImageUrl(rawImage, url),
  };
}

// og:image is often relative ("/og.png"); it's resolved against the page.
// Only something that would itself pass parseFetchableUrl is kept, so the
// image route never even considers a URL the page fetch would refuse.
function resolveImageUrl(raw: string | undefined, pageUrl: string): string | null {
  if (!raw) return null;
  let absolute: string;
  try {
    absolute = new URL(decodeEntities(raw.trim()), pageUrl).toString();
  } catch {
    return null;
  }
  return parseFetchableUrl(absolute)?.toString() ?? null;
}
