import {
  activeMentionQuery,
  insertMention,
  mentionsStillPresent,
  splitMentions,
} from '../src/utils/mentions';

describe('activeMentionQuery', () => {
  test('finds an "@" being typed at the cursor', () => {
    expect(activeMentionQuery('hi @iv', 6)).toEqual({ query: 'iv', start: 3 });
  });

  test('a bare "@" opens suggestions with an empty query', () => {
    expect(activeMentionQuery('@', 1)).toEqual({ query: '', start: 0 });
  });

  test('ignores an "@" inside a word, like an email address', () => {
    expect(activeMentionQuery('mail me@example', 15)).toBeNull();
  });

  test('a space ends the query', () => {
    expect(activeMentionQuery('hi @iv there', 12)).toBeNull();
  });

  test('only looks at text before the cursor', () => {
    expect(activeMentionQuery('@iv hello', 3)).toEqual({ query: 'iv', start: 0 });
  });
});

describe('insertMention', () => {
  test('replaces the query with the full name and moves the cursor after it', () => {
    expect(insertMention('hi @iv', 3, 6, 'Ivaylo Penev')).toEqual({
      text: 'hi @Ivaylo Penev ',
      cursor: 17,
    });
  });

  test('keeps text after the cursor', () => {
    expect(insertMention('@iv later', 0, 3, 'Ivo')).toEqual({ text: '@Ivo  later', cursor: 5 });
  });
});

describe('mentionsStillPresent', () => {
  const picked = [
    { userId: 'u1', name: 'Ivo' },
    { userId: 'u2', name: 'Ann Lee' },
    { userId: 'u1', name: 'Ivo' },
  ];

  test('keeps picked people still named in the text, once each', () => {
    expect(mentionsStillPresent('@Ivo and @Ann Lee', picked)).toEqual(['u1', 'u2']);
  });

  test("drops a mention whose text was deleted", () => {
    expect(mentionsStillPresent('just @Ann Lee', picked)).toEqual(['u2']);
  });
});

describe('splitMentions', () => {
  test('marks mentions of known names', () => {
    expect(splitMentions('hey @Ann Lee, look', ['Ann Lee'])).toEqual([
      { text: 'hey ', isMention: false },
      { text: '@Ann Lee', isMention: true },
      { text: ', look', isMention: false },
    ]);
  });

  test('prefers the longest matching name', () => {
    expect(splitMentions('@Ann Lee hi', ['Ann', 'Ann Lee'])).toEqual([
      { text: '@Ann Lee', isMention: true },
      { text: ' hi', isMention: false },
    ]);
  });

  test('does not match a name that continues into a longer word', () => {
    expect(splitMentions('@Annabel hi', ['Ann'])).toEqual([{ text: '@Annabel hi', isMention: false }]);
  });

  test('handles Cyrillic names and a following letter', () => {
    expect(splitMentions('@Иво здрасти', ['Иво'])).toEqual([
      { text: '@Иво', isMention: true },
      { text: ' здрасти', isMention: false },
    ]);
    expect(splitMentions('@Ивона', ['Иво'])).toEqual([{ text: '@Ивона', isMention: false }]);
  });

  test('ignores an "@" inside a word', () => {
    expect(splitMentions('me@Ann Lee', ['Ann Lee'])).toEqual([
      { text: 'me@Ann Lee', isMention: false },
    ]);
  });

  test('returns the text whole when there is nothing to match', () => {
    expect(splitMentions('no mentions', ['Ann'])).toEqual([{ text: 'no mentions', isMention: false }]);
  });
});
