// Who a push goes to - the decision this function exists to make, kept
// free of I/O so it can be tested directly (recipients_test.ts).

export interface Recipient {
  user_id: string;
  muted_until: string | null;
}

// Not muted, or the mute has expired. An expired mute is indistinguishable
// from no mute, which is why nothing ever has to clear old values. An
// unparseable value is treated as not muted: failing open means an extra
// notification, failing closed would silently drop them all.
export function notMuted(mutedUntil: string | null, now: number): boolean {
  if (!mutedUntil) return true;
  const until = new Date(mutedUntil).getTime();
  return Number.isNaN(until) || until <= now;
}

// Splits a new message's audience (every participant but the sender) into
// who gets the usual push and who gets "Mentioned you".
//
// Mute is enforced here rather than on the client: the point is not to be
// woken, so the push must not be sent at all. Muting is per participant -
// everyone else in a group still gets notified.
//
// An @mention is the exception: being named is the case mute is not meant
// to silence, so a mentioned participant is pushed regardless. Only ids
// that are actually in `participants` count, so an id in `mentions` for
// anyone else reaches no one. `mentions` arrives straight from the
// database row, so anything that isn't an array is treated as none.
export function selectRecipients(
  participants: Recipient[],
  mentions: unknown,
  now: number,
): { regular: string[]; mentioned: string[] } {
  const mentionedSet = new Set<string>(Array.isArray(mentions) ? mentions : []);
  const regular: string[] = [];
  const mentioned: string[] = [];
  for (const participant of participants) {
    if (mentionedSet.has(participant.user_id)) mentioned.push(participant.user_id);
    else if (notMuted(participant.muted_until, now)) regular.push(participant.user_id);
  }
  return { regular, mentioned };
}
