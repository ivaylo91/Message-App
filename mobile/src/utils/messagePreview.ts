import type { TFunction } from 'i18next';
import { AttachmentType, CallStatus } from '../types';

// Shared between the chat's reply quote/bar, and the conversation
// list's last-message preview - anywhere a message needs a short
// human label instead of its raw body.
export function attachmentPreviewText(
  attachmentType: AttachmentType | null | undefined,
  attachmentName: string | null | undefined,
  t: TFunction,
): string | null {
  switch (attachmentType) {
    case 'image':
      return t('conversations.photoPreview');
    case 'audio':
      return t('conversations.audioPreview');
    case 'file':
      return t('conversations.filePreview', { name: attachmentName || t('chat.file') });
    default:
      return null;
  }
}

export type FileIconName =
  | 'file'
  | 'file-pdf'
  | 'file-word'
  | 'file-zipper'
  | 'file-image'
  | 'file-audio'
  | 'file-video'
  | 'file-lines';

// Shared between the chat's file bubble and the media gallery's files
// tab - both need the same mime-type-to-icon mapping.
export function fileIconName(mimeType: string | null | undefined): FileIconName {
  if (!mimeType) return 'file';
  if (mimeType === 'application/pdf') return 'file-pdf';
  if (mimeType.includes('word')) return 'file-word';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return 'file-zipper';
  if (mimeType.startsWith('image/')) return 'file-image';
  if (mimeType.startsWith('audio/')) return 'file-audio';
  if (mimeType.startsWith('video/')) return 'file-video';
  if (mimeType.startsWith('text/')) return 'file-lines';
  return 'file';
}

// Tiered rather than raw minutes throughout, so someone offline for a
// few days reads as "3d ago" instead of an absurd "4320m ago". null
// means we've never recorded a last-seen moment for them at all (e.g.
// an account that predates this feature and hasn't reconnected since) -
// falls back to a bare "Offline" rather than a fabricated duration.
export function formatLastSeen(lastSeenAt: string | null, t: TFunction): string {
  if (!lastSeenAt) return t('chat.offline');

  const elapsedMs = Date.now() - new Date(lastSeenAt).getTime();
  const minutes = Math.floor(elapsedMs / 60_000);

  if (minutes < 1) return t('chat.lastSeenJustNow');
  if (minutes < 60) return t('chat.lastSeenMinutesAgo', { count: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('chat.lastSeenHoursAgo', { count: hours });

  const days = Math.floor(hours / 24);
  return t('chat.lastSeenDaysAgo', { count: days });
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Same idea as attachmentPreviewText, for the other kind of "not a
// plain text message" row a call log produces.
export function callStatusPreviewText(
  callStatus: CallStatus | null | undefined,
  durationMs: number | null | undefined,
  t: TFunction,
): string | null {
  switch (callStatus) {
    case 'missed':
      return t('call.missedCallPreview');
    case 'declined':
      return t('call.declinedCallPreview');
    case 'completed':
      return t('call.completedCallPreview', {
        duration: formatDuration(Math.round((durationMs ?? 0) / 1000)),
      });
    default:
      return null;
  }
}

// True when both timestamps fall on the same local calendar day - what
// decides whether a message starts a new day in the chat and needs a
// divider above it.
export function isSameDay(isoA: string, isoB: string): boolean {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Wall-clock time for a message bubble. Goes through Intl so 12h/24h
// follows the reader's locale (3:45 PM vs 15:45) rather than being
// hardcoded to one of them - Hermes bundles Intl on both platforms for
// this React Native version. The fallback is a plain 24h clock, so a
// runtime without Intl degrades instead of throwing inside every bubble.
export function formatMessageTime(isoDate: string, locale?: string): string {
  const date = new Date(isoDate);
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch {
    return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
}

// Label for a day divider: "Today"/"Yesterday" for the two most recent
// days, otherwise the date - with the year included only when it isn't
// the current one, which is how people actually write dates.
export function formatMessageDay(
  isoDate: string,
  t: TFunction,
  locale?: string,
  now: Date = new Date(),
): string {
  const date = new Date(isoDate);
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (daysAgo === 0) return t('chat.today');
  if (daysAgo === 1) return t('chat.yesterday');

  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
    }).format(date);
  } catch {
    return isoDate.slice(0, 10);
  }
}

// Which messages open a new calendar day, and so need a divider above
// them. Takes the list newest-first, the order ChatScreen's inverted
// FlatList holds - so the message rendered *above* index i is i + 1, and
// a message opens a day when that older neighbour fell on a different
// one. The oldest loaded message always opens a day, so scrolled-back
// history never begins mid-day with no header.
export function messageIdsStartingADay(
  newestFirst: { id: string; created_at: string }[],
): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < newestFirst.length; i++) {
    const older = newestFirst[i + 1];
    if (!older || !isSameDay(newestFirst[i].created_at, older.created_at)) {
      ids.add(newestFirst[i].id);
    }
  }
  return ids;
}
