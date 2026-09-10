import { summarizeUnread } from '../src/utils/unread';

test('counts messages and conversations separately', () => {
  // 3 conversations, 12 messages between them - the bell shows 12, the
  // chats tab shows 3.
  expect(summarizeUnread({ a: 7, b: 4, c: 1 })).toEqual({
    totalMessages: 12,
    conversationsWithUnread: 3,
  });
});

test('is empty when nothing is unread', () => {
  expect(summarizeUnread({})).toEqual({ totalMessages: 0, conversationsWithUnread: 0 });
});

test('does not count a conversation sitting at zero', () => {
  expect(summarizeUnread({ a: 0, b: 0 })).toEqual({
    totalMessages: 0,
    conversationsWithUnread: 0,
  });
  expect(summarizeUnread({ a: 3, b: 0 })).toEqual({
    totalMessages: 3,
    conversationsWithUnread: 1,
  });
});

test('a single unread message reads as one of each', () => {
  expect(summarizeUnread({ a: 1 })).toEqual({
    totalMessages: 1,
    conversationsWithUnread: 1,
  });
});

test('ignores negative counts rather than subtracting from the total', () => {
  expect(summarizeUnread({ a: 5, b: -2 })).toEqual({
    totalMessages: 5,
    conversationsWithUnread: 1,
  });
});
