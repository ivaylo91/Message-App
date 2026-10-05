import { groupPhotoAlbums } from '../src/utils/photoAlbums';

const base = Date.parse('2026-10-05T12:00:00.000Z');
let counter = 0;
const photo = (sender: string, secondsAfter: number, extra: Record<string, unknown> = {}) => ({
  id: `m${++counter}`,
  sender_id: sender,
  attachment_type: 'image' as const,
  media_path: `c/${counter}.jpg`,
  body: null as string | null,
  reply_to_message_id: null as string | null,
  created_at: new Date(base + secondsAfter * 1000).toISOString(),
  deleted_at: null as string | null,
  ...extra,
});
const text = (sender: string, secondsAfter: number) => ({
  ...photo(sender, secondsAfter),
  attachment_type: null,
  media_path: null,
  body: 'hi',
});
// Tests build oldest-first for readability; the function takes newest-first.
const newestFirst = <T,>(oldestFirst: T[]) => [...oldestFirst].reverse();

beforeEach(() => {
  counter = 0;
});

describe('groupPhotoAlbums', () => {
  test('photos sent together become one album, anchored on the oldest', () => {
    const a = photo('ana', 0);
    const b = photo('ana', 2);
    const c = photo('ana', 4);
    const { albumsByAnchorId, hiddenIds } = groupPhotoAlbums(newestFirst([a, b, c]));
    expect(albumsByAnchorId.get(a.id)?.map((m) => m.id)).toEqual([a.id, b.id, c.id]);
    expect([...hiddenIds]).toEqual([b.id, c.id]);
  });

  test('a single photo is not an album', () => {
    const { albumsByAnchorId, hiddenIds } = groupPhotoAlbums([photo('ana', 0)]);
    expect(albumsByAnchorId.size).toBe(0);
    expect(hiddenIds.size).toBe(0);
  });

  test('breaks on a different sender, a text message, or a gap over a minute', () => {
    const msgs = [
      photo('ana', 0),
      photo('ana', 1), // album 1: ana x2
      photo('ivo', 2), // different sender - alone
      text('ana', 3),
      photo('ana', 4),
      photo('ana', 200), // too long after - alone
    ];
    const { albumsByAnchorId } = groupPhotoAlbums(newestFirst(msgs));
    expect([...albumsByAnchorId.values()].map((album) => album.length)).toEqual([2]);
  });

  test('at most four per album; more start the next one', () => {
    const msgs = Array.from({ length: 6 }, (_, i) => photo('ana', i));
    const { albumsByAnchorId } = groupPhotoAlbums(newestFirst(msgs));
    expect([...albumsByAnchorId.values()].map((album) => album.length)).toEqual([4, 2]);
  });

  test('captioned photos, replies, deleted and still-sending photos stay on their own', () => {
    const msgs = [
      photo('ana', 0, { body: 'look' }),
      photo('ana', 1, { reply_to_message_id: 'x' }),
      photo('ana', 2, { deleted_at: '2026-10-05T12:01:00.000Z' }),
      photo('ana', 3, { _pending: true }),
    ];
    expect(groupPhotoAlbums(newestFirst(msgs)).albumsByAnchorId.size).toBe(0);
  });
});
