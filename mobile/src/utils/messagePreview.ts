import type { TFunction } from 'i18next';
import { AttachmentType } from '../types';

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