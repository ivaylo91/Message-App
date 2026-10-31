import { assertEquals } from "jsr:@std/assert@1";
import { extractPreview, isBlockedAddress, parseFetchableUrl } from "./preview.ts";

Deno.test("parseFetchableUrl: accepts ordinary web URLs", () => {
  assertEquals(parseFetchableUrl("https://example.com/a?b=1")?.hostname, "example.com");
  assertEquals(parseFetchableUrl("http://example.com:80/")?.hostname, "example.com");
});

Deno.test("parseFetchableUrl: refuses other schemes, credentials and odd ports", () => {
  for (const raw of [
    "file:///etc/passwd",
    "ftp://example.com",
    "javascript:alert(1)",
    "https://user:pass@example.com",
    "http://example.com:6379",
    "http://example.com:8080",
    "not a url",
  ]) {
    assertEquals(parseFetchableUrl(raw), null, raw);
  }
});

Deno.test("isBlockedAddress: private, loopback, link-local and metadata IPv4 are blocked", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "255.255.255.255",
  ]) {
    assertEquals(isBlockedAddress(ip), true, ip);
  }
});

Deno.test("isBlockedAddress: public IPv4 is allowed, including near the private ranges", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.255.255", "93.184.216.34"]) {
    assertEquals(isBlockedAddress(ip), false, ip);
  }
});

Deno.test("isBlockedAddress: private IPv4 is blocked in every IPv6 spelling", () => {
  // What `new URL()` turns [::ffff:169.254.169.254] and friends into, which
  // is what reaches the check - the dotted form never does for a literal.
  for (const ip of [
    "[::ffff:7f00:1]", // ::ffff:127.0.0.1
    "[::ffff:a9fe:a9fe]", // ::ffff:169.254.169.254
    "::ffff:a00:1", // 10.0.0.1
    "0:0:0:0:0:ffff:7f00:1",
    "::7f00:1", // IPv4-compatible
    "64:ff9b::a9fe:a9fe", // NAT64
    "2002:a9fe:a9fe::", // 6to4
    "2001:0:4136:e378::1", // Teredo
    "2001:db8::1",
    "fec0::1",
    "100::1",
    "fe80::1%eth0",
  ]) {
    assertEquals(isBlockedAddress(ip), true, ip);
  }
});

Deno.test("isBlockedAddress: public addresses survive the same checks", () => {
  for (const ip of [
    "2606:4700:4700::1111",
    "2a00:1450:4001:81a::200e",
    "::ffff:8.8.8.8",
    "::ffff:808:808",
    "64:ff9b::808:808",
    "2002:808:808::",
  ]) {
    assertEquals(isBlockedAddress(ip), false, ip);
  }
});

Deno.test("isBlockedAddress: IPv6 loopback, unique-local, link-local and mapped-private are blocked", () => {
  for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "[::1]"]) {
    assertEquals(isBlockedAddress(ip), true, ip);
  }
  assertEquals(isBlockedAddress("2606:4700:4700::1111"), false);
  assertEquals(isBlockedAddress("::ffff:8.8.8.8"), false);
});

Deno.test("isBlockedAddress: something that isn't an address is refused", () => {
  assertEquals(isBlockedAddress("localhost"), true);
  assertEquals(isBlockedAddress("999.1.1.1"), true);
});

Deno.test("extractPreview: prefers Open Graph, decodes entities, either attribute order", () => {
  const html = `<html><head>
    <title>Fallback title</title>
    <meta content="Café &amp; Co" property="og:title">
    <meta property='og:description' content='Best &quot;coffee&quot; in town&#33;'>
    <meta property="og:site_name" content="Example">
  </head></html>`;
  assertEquals(extractPreview(html, "https://example.com"), {
    url: "https://example.com",
    title: "Café & Co",
    description: 'Best "coffee" in town!',
    siteName: "Example",
    imageUrl: null,
  });
});

Deno.test("extractPreview: falls back to <title> and the description meta", () => {
  const html = `<title>
    Plain   page </title><meta name="description" content="A page.">`;
  assertEquals(extractPreview(html, "https://x.test"), {
    url: "https://x.test",
    title: "Plain page",
    description: "A page.",
    siteName: null,
    imageUrl: null,
  });
});

Deno.test("extractPreview: nothing useful gives an empty preview", () => {
  assertEquals(extractPreview("<html><body>hi</body></html>", "https://x.test"), {
    url: "https://x.test",
    title: null,
    description: null,
    siteName: null,
    imageUrl: null,
  });
});

Deno.test("extractPreview: long text is cut with an ellipsis", () => {
  const long = "a".repeat(300);
  const result = extractPreview(`<meta property="og:description" content="${long}">`, "https://x.test");
  assertEquals(result.description?.length, 200);
  assertEquals(result.description?.endsWith("…"), true);
});

Deno.test("extractPreview: og:image is resolved against the page and must be fetchable", () => {
  const page = "https://example.com/blog/post";
  const image = (tag: string) => extractPreview(tag, page).imageUrl;
  assertEquals(image('<meta property="og:image" content="/img/og.png">'), "https://example.com/img/og.png");
  assertEquals(
    image('<meta property="og:image" content="https://cdn.example.com/a.jpg?w=1&amp;h=2">'),
    "https://cdn.example.com/a.jpg?w=1&h=2",
  );
  assertEquals(image('<meta name="twitter:image" content="https://cdn.example.com/t.png">'), "https://cdn.example.com/t.png");
  // Same rules as any fetch: no other schemes, no odd ports.
  assertEquals(image('<meta property="og:image" content="file:///etc/passwd">'), null);
  assertEquals(image('<meta property="og:image" content="http://example.com:6379/x.png">'), null);
  assertEquals(image("<title>no image</title>"), null);
});
