import { isMuted, isMutedAlways, mutedUntilFor } from '../src/utils/mute';

const now = new Date('2026-09-11T12:00:00.000Z');

describe('mutedUntilFor', () => {
  test('offsets from now for a fixed duration', () => {
    expect(mutedUntilFor('eightHours', now)).toBe('2026-09-11T20:00:00.000Z');
    expect(mutedUntilFor('oneWeek', now)).toBe('2026-09-18T12:00:00.000Z');
  });

  test('always is a far-future timestamp, not a flag', () => {
    const until = mutedUntilFor('always', now);
    expect(new Date(until).getFullYear()).toBeGreaterThan(9000);
  });
});

describe('isMuted', () => {
  test('an unset value is not muted', () => {
    expect(isMuted(null, now)).toBe(false);
    expect(isMuted(undefined, now)).toBe(false);
  });

  test('a future timestamp is muted', () => {
    expect(isMuted('2026-09-11T20:00:00.000Z', now)).toBe(true);
  });

  // The reason a mute needs no scheduled job to undo it.
  test('an expired mute reads exactly like no mute', () => {
    expect(isMuted('2026-09-11T11:59:59.000Z', now)).toBe(false);
  });

  test('the boundary is not muted', () => {
    expect(isMuted('2026-09-11T12:00:00.000Z', now)).toBe(false);
  });

  test('garbage is treated as not muted rather than throwing', () => {
    expect(isMuted('not a date', now)).toBe(false);
  });

  test('round-trips with mutedUntilFor', () => {
    expect(isMuted(mutedUntilFor('eightHours', now), now)).toBe(true);
    expect(isMuted(mutedUntilFor('always', now), now)).toBe(true);
  });
});

describe('isMutedAlways', () => {
  test('separates indefinite from timed mutes', () => {
    expect(isMutedAlways(mutedUntilFor('always', now), now)).toBe(true);
    expect(isMutedAlways(mutedUntilFor('oneWeek', now), now)).toBe(false);
    expect(isMutedAlways(mutedUntilFor('eightHours', now), now)).toBe(false);
  });

  test('is false when not muted at all', () => {
    expect(isMutedAlways(null, now)).toBe(false);
    expect(isMutedAlways('2026-09-11T11:00:00.000Z', now)).toBe(false);
  });
});
