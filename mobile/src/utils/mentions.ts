// @mentions in group chats.
//
// A mention is stored twice, on purpose: as plain "@Display Name" text in
// the body, so it reads correctly everywhere a body is shown (previews,
// notifications, older builds, search), and as the person's id in
// messages.mentions, which is what the push function trusts to decide
// who was mentioned - text alone can't say which of two "Alex"es was
// meant, and can't be verified.

export interface PickedMention {
  userId: string;
  name: string;
}

// Characters allowed in what you type after "@" before picking someone.
// No spaces: the query is what's typed so far, and a space ends it - the
// full name, spaces included, is only inserted once a person is picked.
const QUERY_PATTERN = /(^|\s)@([^\s@]*)$/;

// The "@query" being typed at the cursor, if any. Only an "@" at the
// start or after whitespace counts, so an email address doesn't open the
// suggestion list.
export function activeMentionQuery(
  text: string,
  cursor: number,
): { query: string; start: number } | null {
  const match = QUERY_PATTERN.exec(text.slice(0, cursor));
  if (!match) return null;
  const query = match[2];
  return { query, start: cursor - query.length - 1 };
}

// Replaces the "@query" (from `start` to `cursor`) with "@Name " and
// returns the new text and where the cursor should go - right after it.
export function insertMention(
  text: string,
  start: number,
  cursor: number,
  name: string,
): { text: string; cursor: number } {
  const inserted = `@${name} `;
  return {
    text: text.slice(0, start) + inserted + text.slice(cursor),
    cursor: start + inserted.length,
  };
}

// The ids to store with a message: the people picked while composing whose
// "@Name" is still in the final text - deleting a mention's text removes
// the mention. Each person once, in the order first picked.
export function mentionsStillPresent(text: string, picked: PickedMention[]): string[] {
  const ids: string[] = [];
  for (const mention of picked) {
    if (!ids.includes(mention.userId) && text.includes(`@${mention.name}`)) {
      ids.push(mention.userId);
    }
  }
  return ids;
}

export interface MentionSegment {
  text: string;
  isMention: boolean;
}

// Splits a body into plain text and "@Name" mentions of the given names,
// for highlighting. Longest names are tried first, so "@Ann Lee" isn't cut
// short by an "@Ann" in the same chat. A name that isn't followed by a
// word boundary ("@Annabel" when only "Ann" was mentioned) is left alone.
export function splitMentions(text: string, names: string[]): MentionSegment[] {
  const candidates = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (candidates.length === 0 || !text.includes('@')) return [{ text, isMention: false }];

  const segments: MentionSegment[] = [];
  let plain = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '@' && (i === 0 || /\s/.test(text[i - 1]))) {
      const name = candidates.find((n) => {
        if (!text.startsWith(n, i + 1)) return false;
        const after = text[i + 1 + n.length];
        return after === undefined || !/[\p{L}\p{N}_]/u.test(after);
      });
      if (name) {
        if (plain) segments.push({ text: plain, isMention: false });
        plain = '';
        segments.push({ text: `@${name}`, isMention: true });
        i += name.length + 1;
        continue;
      }
    }
    plain += text[i];
    i += 1;
  }
  if (plain) segments.push({ text: plain, isMention: false });
  return segments;
}
