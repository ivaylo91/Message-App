import { runPositions, showsSenderName } from '../src/utils/messageGrouping';

const base = new Date('2026-09-11T12:00:00Z').getTime();

// Messages are held newest-first, so the first argument here is the
// newest and appears at the bottom of the screen.
function msg(id: string, sender: string, minutesAfterBase: number) {
  return {
    id,
    sender_id: sender,
    created_at: new Date(base + minutesAfterBase * 60_000).toISOString(),
  };
}

test('a lone message is a single', () => {
  expect(runPositions([msg('m1', 'a', 0)]).get('m1')).toBe('single');
});

test('alternating senders never group', () => {
  const positions = runPositions([msg('m3', 'b', 2), msg('m2', 'a', 1), msg('m1', 'b', 0)]);

  expect([...positions.values()]).toEqual(['single', 'single', 'single']);
});

test('marks the ends and middle of a run, read top to bottom', () => {
  // Newest first: m3, m2, m1 - so on screen m1 is at the top.
  const positions = runPositions([msg('m3', 'a', 2), msg('m2', 'a', 1), msg('m1', 'a', 0)]);

  expect(positions.get('m1')).toBe('first');
  expect(positions.get('m2')).toBe('middle');
  expect(positions.get('m3')).toBe('last');
});

test('a two-message run is just a first and a last', () => {
  const positions = runPositions([msg('m2', 'a', 1), msg('m1', 'a', 0)]);

  expect(positions.get('m1')).toBe('first');
  expect(positions.get('m2')).toBe('last');
});

test('a long enough gap splits a run even for the same sender', () => {
  // 6 minutes apart, past the 5 minute window.
  const positions = runPositions([msg('m2', 'a', 6), msg('m1', 'a', 0)]);

  expect(positions.get('m1')).toBe('single');
  expect(positions.get('m2')).toBe('single');
});

test('a gap inside a longer run splits it into two runs', () => {
  const positions = runPositions([
    msg('m4', 'a', 21),
    msg('m3', 'a', 20),
    msg('m2', 'a', 1),
    msg('m1', 'a', 0),
  ]);

  expect(positions.get('m1')).toBe('first');
  expect(positions.get('m2')).toBe('last');
  expect(positions.get('m3')).toBe('first');
  expect(positions.get('m4')).toBe('last');
});

test('clock skew on a pending message does not split a run', () => {
  // A locally-stamped message can land slightly before the server-stamped
  // one above it; that must not read as a 'single'.
  const positions = runPositions([msg('pending', 'a', -0.2), msg('m1', 'a', 0)]);

  expect(positions.get('m1')).toBe('first');
  expect(positions.get('pending')).toBe('last');
});

test('handles an empty list', () => {
  expect(runPositions([]).size).toBe(0);
});

test('covers every message exactly once', () => {
  const all = [msg('m3', 'a', 2), msg('m2', 'b', 1), msg('m1', 'a', 0)];

  expect(runPositions(all).size).toBe(all.length);
});

describe('showsSenderName', () => {
  test('names the sender once, at the top of a run', () => {
    expect(showsSenderName('first')).toBe(true);
    expect(showsSenderName('single')).toBe(true);
  });

  test('stays quiet for the rest of the run', () => {
    expect(showsSenderName('middle')).toBe(false);
    expect(showsSenderName('last')).toBe(false);
  });
});
