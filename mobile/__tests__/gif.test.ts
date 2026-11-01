import { GIF_PAGE_SIZE, gifRequestUrl, parseGifPage } from '../src/data/giphy';
import { gifUrlOf } from '../src/utils/gif';
import { bodyPreviewText } from '../src/utils/messagePreview';

const t = ((key: string) => key) as never;

const SEND_URL = 'https://media2.giphy.com/media/v1.abc/xyz/giphy.webp?cid=123&ct=g';
const PREVIEW_URL = 'https://media2.giphy.com/media/v1.abc/xyz/100w.webp?cid=123';

describe('gifUrlOf', () => {
  it.each([
    SEND_URL,
    'https://media.giphy.com/media/xyz/giphy.gif',
    'https://i.giphy.com/xyz.webp',
  ])('accepts %s', (url) => {
    expect(gifUrlOf(url)).toBe(url);
  });

  it.each([
    null,
    undefined,
    '',
    'look at this',
    `look at this ${SEND_URL}`,
    `${SEND_URL} nice`,
    'http://media.giphy.com/media/xyz/giphy.gif',
    'https://giphy.com/gifs/xyz',
    'https://media.giphy.com.evil.example/x.gif',
    'https://media.giphy.com@evil.example/x.gif',
    'https://evil.example/media.giphy.com/x.gif',
  ])('rejects %s', (body) => {
    expect(gifUrlOf(body)).toBeNull();
  });
});

describe('bodyPreviewText', () => {
  it('labels a GIF instead of showing its link', () => {
    expect(bodyPreviewText(SEND_URL, t)).toBe('conversations.gifPreview');
  });

  it('leaves ordinary text alone', () => {
    expect(bodyPreviewText('hello', t)).toBe('hello');
    expect(bodyPreviewText(null, t)).toBeNull();
  });
});

describe('gifRequestUrl', () => {
  it('asks for trending when there is no query', () => {
    expect(gifRequestUrl('', 0, 'en')).toContain('/v1/gifs/trending?');
  });

  it('encodes the query and sends the language', () => {
    const url = gifRequestUrl('cats & dogs', 48, 'bg');
    expect(url).toContain('/v1/gifs/search?');
    expect(url).toContain('q=cats%20%26%20dogs');
    expect(url).toContain('offset=48');
    expect(url).toContain('lang=bg');
  });

  it('always limits the content rating', () => {
    expect(gifRequestUrl('', 0, 'en')).toContain('rating=pg');
    expect(gifRequestUrl('cats', 0, 'en')).toContain('rating=pg');
  });
});

describe('parseGifPage', () => {
  const gif = (id: string) => ({
    id,
    title: `gif ${id}`,
    images: {
      fixed_width_small: { url: 'https://media2.giphy.com/s.gif', webp: PREVIEW_URL },
      downsized: { url: SEND_URL },
    },
  });

  it('keeps URLs exactly as GIPHY returned them, in order', () => {
    const page = parseGifPage(
      { data: [gif('a'), gif('b')], pagination: { total_count: 100, count: 2 } },
      0,
    );
    expect(page.gifs.map((g) => g.id)).toEqual(['a', 'b']);
    expect(page.gifs[0].previewUrl).toBe(PREVIEW_URL);
    expect(page.gifs[0].sendUrl).toBe(SEND_URL);
  });

  it('points at the next page while more remain', () => {
    const page = parseGifPage(
      { data: [gif('a')], pagination: { total_count: 100, count: GIF_PAGE_SIZE } },
      24,
    );
    expect(page.nextOffset).toBe(48);
  });

  it('stops at the last page', () => {
    const page = parseGifPage({ data: [gif('a')], pagination: { total_count: 25, count: 1 } }, 24);
    expect(page.nextOffset).toBeNull();
  });

  it('stops when a page comes back empty', () => {
    expect(parseGifPage({ data: [], pagination: { total_count: 500, count: 0 } }, 24).nextOffset).toBeNull();
  });

  it('skips an entry the bubble could not show', () => {
    const page = parseGifPage(
      {
        data: [
          { id: 'x', images: { fixed_width_small: { url: PREVIEW_URL }, downsized: { url: 'https://evil.example/x.gif' } } },
          { id: 'y' },
        ],
        pagination: { total_count: 2, count: 2 },
      },
      0,
    );
    expect(page.gifs).toEqual([]);
  });
});
