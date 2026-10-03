import { Message } from '../../types';

// Shared by ChatScreen and the components split out of it.

// Messages we've sent locally but haven't heard back from the server on
// yet - shown immediately (dimmed) instead of waiting on a round-trip.
export type LocalMessage = Message & { _pending?: boolean };

export type MessageStatus = 'pending' | 'sent' | 'read';
export const STATUS_ICONS: Record<MessageStatus, 'clock' | 'check' | 'check-double'> = {
  pending: 'clock',
  sent: 'check',
  read: 'check-double',
};
