import { hasLink, linkifyText } from '../src/utils/linkify';

describe('linkifyText', () => {
  test('leaves a message with no links as one plain segment', () => {
    expect(linkifyText('just a normal message')).toEqual([{ text: 'just a normal message' }]);
    expect(linkifyText('')).toEqual([{ text: '' }]);
  });

  test('splits text around a link', () => {
    expect(linkifyText('see https://example.com now')).toEqual([
      { text: 'see ' },
      { text: 'https://example.com', url: 'https://example.com' },
      { text: ' now' },
    ]);
  });

  test('makes a bare www host absolute so it can be opened', () => {
    expect(linkifyText('www.example.com')).toEqual([
      { text: 'www.example.com', url: 'https://www.example.com' },
    ]);
  });

  test('finds several links in one message', () => {
    const segments = linkifyText('a https://one.com b http://two.com c');
    expect(segments.filter((s) => s.url).map((s) => s.url)).toEqual([
      'https://one.com',
      'http://two.com',
    ]);
    expect(segments.map((s) => s.text).join('')).toBe('a https://one.com b http://two.com c');
  });

  test('leaves sentence punctuation out of the link', () => {
    const segments = linkifyText('go to https://example.com.');
    expect(segments[1]).toEqual({ text: 'https://example.com', url: 'https://example.com' });
    // The trimmed full stop must survive as text, not vanish.
    expect(segments.map((s) => s.text).join('')).toBe('go to https://example.com.');
  });

  test('keeps a balanced bracket that belongs to the URL', () => {
    const segments = linkifyText('https://en.wikipedia.org/wiki/Fjord_(landform)');
    expect(segments[0].url).toBe('https://en.wikipedia.org/wiki/Fjord_(landform)');
  });

  test('drops an unbalanced closing bracket', () => {
    const segments = linkifyText('(see https://example.com)');
    expect(segments.find((s) => s.url)?.url).toBe('https://example.com');
    expect(segments.map((s) => s.text).join('')).toBe('(see https://example.com)');
  });

  test('never loses or duplicates any of the original text', () => {
    const bodies = [
      'plain',
      'https://a.com',
      'x https://a.com y www.b.com z.',
      'trailing https://a.com!!!',
      '(https://a.com)',
    ];
    for (const body of bodies) {
      expect(linkifyText(body).map((s) => s.text).join('')).toBe(body);
    }
  });

  test('does not link a bare domain or a filename', () => {
    expect(linkifyText('notes.txt').every((s) => !s.url)).toBe(true);
    expect(linkifyText('example.com').every((s) => !s.url)).toBe(true);
    expect(linkifyText('etc. something').every((s) => !s.url)).toBe(true);
  });

  test('is not affected by the previous call (regex lastIndex)', () => {
    expect(linkifyText('https://a.com').some((s) => s.url)).toBe(true);
    expect(linkifyText('https://a.com').some((s) => s.url)).toBe(true);
  });
});

describe('hasLink', () => {
  test('reports whether the segmented path is needed at all', () => {
    expect(hasLink('nothing here')).toBe(false);
    expect(hasLink('a https://example.com b')).toBe(true);
    expect(hasLink('www.example.com')).toBe(true);
  });

  test('is repeatable', () => {
    expect(hasLink('https://a.com')).toBe(true);
    expect(hasLink('https://a.com')).toBe(true);
  });
});
