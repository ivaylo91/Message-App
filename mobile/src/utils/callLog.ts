import { isSameDay } from './messagePreview';

// What the Calls tab needs from a call-summary message.
export interface CallLogItem {
  id: string;
  conversation_id: string;
  sender_id: string;
  call_status: 'completed' | 'missed' | 'declined' | null;
  created_at: string;
}

// From the viewer's side: a call they placed, one they took, or one they
// missed. A missed call only counts as missed for the person who was
// called - for the caller it is an outgoing call nobody answered.
export type CallDirection = 'outgoing' | 'incoming' | 'missed';

export interface CallLogRow<T extends CallLogItem> {
  // The newest call of a run; the row shows its time and outcome.
  entry: T;
  direction: CallDirection;
  // How many calls the row stands for: repeated tries at the same person
  // with the same result collapse into one row, "Maria (3)".
  count: number;
}

export interface CallLogDay<T extends CallLogItem> {
  // created_at of the day's newest call - enough to label the day.
  date: string;
  rows: CallLogRow<T>[];
}

export function callDirection(entry: CallLogItem, userId: string | null): CallDirection {
  if (entry.sender_id === userId) return 'outgoing';
  return entry.call_status === 'missed' ? 'missed' : 'incoming';
}

// Groups a newest-first call log into days, collapsing consecutive calls
// with the same person, direction and outcome within a day.
export function groupCallLog<T extends CallLogItem>(
  entries: T[],
  userId: string | null,
): CallLogDay<T>[] {
  const days: CallLogDay<T>[] = [];
  for (const entry of entries) {
    const direction = callDirection(entry, userId);
    let day = days[days.length - 1];
    if (!day || !isSameDay(day.date, entry.created_at)) {
      day = { date: entry.created_at, rows: [] };
      days.push(day);
    }
    const last = day.rows[day.rows.length - 1];
    if (
      last &&
      last.entry.conversation_id === entry.conversation_id &&
      last.direction === direction &&
      last.entry.call_status === entry.call_status &&
      // A completed call has its own duration worth seeing.
      entry.call_status !== 'completed'
    ) {
      last.count += 1;
    } else {
      day.rows.push({ entry, direction, count: 1 });
    }
  }
  return days;
}
