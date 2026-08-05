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