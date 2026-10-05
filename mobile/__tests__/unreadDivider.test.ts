import { unreadDividerMessageId } from '../src/utils/unreadDivider';

const ME = 'me';
const msg = (id: string, sender: string, deleted = false) => ({
  id,
  sender_id: sender,
  deleted_at: deleted ? '2026-10-05T10:00:00.000Z' : null,
});

// Newest first, as ChatScreen holds them.
const thread = [
  msg('m6', 'ana'),
  msg('m5', ME),
  msg('m4', 'ana'),
  msg('m3', 'ana', true),
  msg('m2', 'ana'),
  msg('m1', ME),
];

describe('unreadDividerMessageId', () => {
  test('nothing unread means no divider', () => {
    expect(unreadDividerMessageId(thread, 0, ME)).toBeNull();
  });

  test('sits above the oldest of the unread messages from others', () => {
    expect(unreadDividerMessageId(thread, 1, ME)).toBe('m6');
    expect(unreadDividerMessageId(thread, 2, ME)).toBe('m4');
  });

  test("skips the user's own messages and deleted ones, as the count does", () => {
    expect(unreadDividerMessageId(thread, 3, ME)).toBe('m2');
  });

  test('a count reaching past what is loaded stops at the oldest loaded', () => {
    expect(unreadDividerMessageId(thread, 10, ME)).toBe('m2');
  });

  test('no messages from others at all means no divider', () => {
    expect(unreadDividerMessageId([msg('a', ME)], 3, ME)).toBeNull();
  });
});
