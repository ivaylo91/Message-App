// A GIF message is an ordinary text message whose whole body is a GIPHY media
// link. That keeps the outbox, replies, forwarding, saving and search working
// with no schema change, and an older app simply shows a link.
//
// Only GIPHY's own media hosts count. A bubble loads this URL by itself, so
// matching anything looser would let a sender make everyone in a chat fetch
// an address of their choosing, which reveals each viewer's IP to that host.
const GIPHY_MEDIA_URL = /^https:\/\/(?:media\d*|i)\.giphy\.com\/\S+$/;

export function gifUrlOf(body: string | null | undefined): string | null {
  return body && GIPHY_MEDIA_URL.test(body) ? body : null;
}
