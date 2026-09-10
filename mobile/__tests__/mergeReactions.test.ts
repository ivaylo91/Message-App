import { mergeReactions } from '../src/utils/reactions';
import { MessageReaction } from '../src/types';

function reaction(id: string, messageId = 'm1', emoji = '👍'): MessageReaction {
  return {
    id,
    message_id: messageId,
    conversation_id: 'c1',
    user_id: 'u1',
    emoji,
    created_at: '2026-09-10T12:00:00.000Z',
  };
}

test('appends reactions from a newly loaded page', () => {
  const current = [reaction('r1')];
  const merged = mergeReactions(current, [reaction('r2'), reaction('r3')]);

  expect(merged.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
});

test('drops ones already held, so a bubble cannot count them twice', () => {
  const current = [reaction('r1'), reaction('r2')];

  // r2 overlaps - realtime delivered it while the page was in flight.
  const merged = mergeReactions(current, [reaction('r2'), reaction('r3')]);

  expect(merged.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
});

test('returns the same array when there is nothing new', () => {
  const current = [reaction('r1')];

  expect(mergeReactions(current, [])).toBe(current);
  expect(mergeReactions(current, [reaction('r1')])).toBe(current);
});

test('does not mutate the array it was given', () => {
  const current = [reaction('r1')];
  mergeReactions(current, [reaction('r2')]);

  expect(current.map((r) => r.id)).toEqual(['r1']);
});
