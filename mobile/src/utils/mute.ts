// How long a mute lasts. "Always" is a far-future timestamp rather than a
// separate flag, so every read is the same comparison and an expiring mute
// needs no scheduled job to undo it - it simply stops being in the future.
export type MuteDuration = 'eightHours' | 'oneWeek' | 'always';

const ALWAYS_UNTIL = '9999-12-31T23:59:59.000Z';

const DURATION_MS: Record<Exclude<MuteDuration, 'always'>, number> = {
  eightHours: 8 * 60 * 60 * 1000,
  oneWeek: 7 * 24 * 60 * 60 * 1000,
};

// The value to write to conversation_participants.muted_until.
export function mutedUntilFor(duration: MuteDuration, now: Date = new Date()): string {
  if (duration === 'always') return ALWAYS_UNTIL;
  return new Date(now.getTime() + DURATION_MS[duration]).toISOString();
}

// A mute that has run out reads exactly like one that was never set, so
// nothing has to clean expired rows up.
export function isMuted(mutedUntil: string | null | undefined, now: Date = new Date()): boolean {
  if (!mutedUntil) return false;
  const until = new Date(mutedUntil).getTime();
  if (Number.isNaN(until)) return false;
  return until > now.getTime();
}

// Distinguishes "muted until a specific time" from "muted indefinitely",
// so the UI can offer Unmute without implying an end date that is really
// the year 9999.
export function isMutedAlways(
  mutedUntil: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!isMuted(mutedUntil, now)) return false;
  // Anything more than a year out was written as "always"; nothing else
  // this app offers comes close.
  return new Date(mutedUntil as string).getTime() - now.getTime() > 365 * 24 * 60 * 60 * 1000;
}
