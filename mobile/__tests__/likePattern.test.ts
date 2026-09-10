import { escapeLikePattern } from '../src/utils/likePattern';

test('escapes LIKE wildcards so they match literally', () => {
  expect(escapeLikePattern('50%')).toBe('50\\%');
  expect(escapeLikePattern('a_b')).toBe('a\\_b');
  expect(escapeLikePattern('50%_off')).toBe('50\\%\\_off');
});

test('escapes the escape character itself', () => {
  expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
});

// The backslash pass has to run first. If wildcards were escaped before
// backslashes, the backslashes that pass had just *added* would then be
// escaped a second time - turning \% into \\\\% and breaking the match.
test('escapes a backslash before a wildcard, not after', () => {
  expect(escapeLikePattern('\\%')).toBe('\\\\\\%');
});

test('leaves ordinary text alone', () => {
  expect(escapeLikePattern('hello world')).toBe('hello world');
  expect(escapeLikePattern('')).toBe('');
});
