export interface TextSegment {
  text: string;
  // Present when this segment should be rendered as a tappable link.
  // Always absolute, so it can be handed straight to Linking.openURL -
  // a bare "www.example.com" gets https:// prefixed here rather than at
  // the call site.
  url?: string;
}

// Deliberately conservative. Matches an explicit http(s):// URL, or a
// bare host that starts with www. - and nothing else. Bare "example.com"
// is left alone on purpose: it would turn ordinary sentences containing
// "etc.com" or a file name like "notes.txt" into links, and a false
// positive here is worse than a missed one, since tapping it navigates
// out of the app.
const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<>]+)/gi;

// Trailing punctuation almost always belongs to the sentence, not the
// URL - "see https://example.com." should link the URL and leave the
// full stop behind. Closing brackets are only trimmed when unbalanced,
// so a link that legitimately contains one (Wikipedia's
// /wiki/Foo_(bar) being the classic case) survives.
function trimTrailingPunctuation(url: string): string {
  let end = url.length;
  while (end > 0) {
    const char = url[end - 1];
    if ('.,;:!?"\''.includes(char)) {
      end -= 1;
      continue;
    }
    if (char === ')' || char === ']') {
      const open = char === ')' ? '(' : '[';
      const candidate = url.slice(0, end);
      const opens = candidate.split(open).length - 1;
      const closes = candidate.split(char).length - 1;
      if (closes > opens) {
        end -= 1;
        continue;
      }
    }
    break;
  }
  return url.slice(0, end);
}

// Splits a message body into plain and linked runs, so the chat bubble
// can render URLs as tappable without turning the whole body into
// markup. Returns a single plain segment when there's nothing to link,
// which is the overwhelmingly common case.
export function linkifyText(body: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  // The regex is module-level and /g, so its lastIndex has to be reset -
  // otherwise consecutive calls resume mid-string and skip matches.
  URL_PATTERN.lastIndex = 0;

  let match = URL_PATTERN.exec(body);
  while (match !== null) {
    const raw = match[0];
    const url = trimTrailingPunctuation(raw);

    // Punctuation trimmed off the match has to go back into the
    // following plain-text run rather than being dropped.
    if (url.length > 0) {
      if (match.index > lastIndex) {
        segments.push({ text: body.slice(lastIndex, match.index) });
      }
      segments.push({
        text: url,
        url: url.toLowerCase().startsWith('www.') ? `https://${url}` : url,
      });
      lastIndex = match.index + url.length;
    }

    match = URL_PATTERN.exec(body);
  }

  if (lastIndex < body.length) segments.push({ text: body.slice(lastIndex) });
  return segments.length > 0 ? segments : [{ text: body }];
}

// Lets the bubble skip the segmented rendering path entirely for the
// common case of a message with no links in it.
export function hasLink(body: string): boolean {
  URL_PATTERN.lastIndex = 0;
  return URL_PATTERN.test(body);
}
