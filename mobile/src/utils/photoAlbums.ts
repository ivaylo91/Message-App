import type { Message } from '../types';

// Several photos sent together arrive as several messages - one per photo
// - and used to fill the chat with a bubble each. They're grouped into an
// album at display time instead, so nothing about how photos are sent or
// stored changes, and photos sent before this existed group too.
//
// Grouped: consecutive photo-only messages (no caption, not a reply) from
// the same sender, each within ALBUM_WINDOW_MS of the one before, up to
// ALBUM_MAX_PHOTOS per album.

export const ALBUM_WINDOW_MS = 60_000;
export const ALBUM_MAX_PHOTOS = 4;

type AlbumCandidate = Pick<
  Message,
  'id' | 'sender_id' | 'attachment_type' | 'media_path' | 'body' | 'reply_to_message_id' | 'created_at' | 'deleted_at'
> & { _pending?: boolean };

function isAlbumPhoto(message: AlbumCandidate): boolean {
  return (
    message.attachment_type === 'image' &&
    !!message.media_path &&
    !message.body &&
    !message.reply_to_message_id &&
    !message.deleted_at &&
    !message._pending
  );
}

export interface PhotoAlbums<T> {
  // Keyed by the album's oldest photo, which is where the album renders -
  // it's the one that carries the day divider when the album opens a day.
  // Members oldest first, i.e. in the order they were sent.
  albumsByAnchorId: Map<string, T[]>;
  // The other members, which render nothing: they're shown in the album.
  hiddenIds: Set<string>;
}

// `messages` is newest-first, as ChatScreen holds them.
export function groupPhotoAlbums<T extends AlbumCandidate>(messages: T[]): PhotoAlbums<T> {
  const albumsByAnchorId = new Map<string, T[]>();
  const hiddenIds = new Set<string>();

  // Walk oldest to newest so each album fills up in the order it was sent.
  let current: T[] = [];
  const flush = () => {
    if (current.length >= 2) {
      albumsByAnchorId.set(current[0].id, current);
      for (const member of current.slice(1)) hiddenIds.add(member.id);
    }
    current = [];
  };

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!isAlbumPhoto(message)) {
      flush();
      continue;
    }
    const previous = current[current.length - 1];
    const joins =
      previous &&
      previous.sender_id === message.sender_id &&
      current.length < ALBUM_MAX_PHOTOS &&
      new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() <=
        ALBUM_WINDOW_MS;
    if (!joins) flush();
    current.push(message);
  }
  flush();

  return { albumsByAnchorId, hiddenIds };
}
