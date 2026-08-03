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