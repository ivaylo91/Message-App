import type { TFunction } from 'i18next';
import {
  attachmentPreviewText,
  callStatusPreviewText,
  fileIconName,
  formatDuration,
  formatLastSeen,
  formatMessageDay,
  formatMessageTime,
  isSameDay,
  messageIdsStartingADay,
} from '../src/utils/messagePreview';

// Echoes the key (and any interpolation) back, so assertions read as
// "which string was chosen", independent of the actual translations.
const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key}:${JSON.stringify(options)}` : key) as unknown as TFunction;

describe('attachmentPreviewText', () => {
  test('names each attachment kind', () => {
    expect(attachmentPreviewText('image', null, t)).toBe('conversations.photoPreview');
    expect(attachmentPreviewText('audio', null, t)).toBe('conversations.audioPreview');
    expect(attachmentPreviewText('file', 'report.pdf', t)).toBe(
      'conversations.filePreview:{"name":"report.pdf"}',
    );
  });

  test('falls back to a generic label for a nameless file', () => {
    expect(attachmentPreviewText('file', null, t)).toBe(
      'conversations.filePreview:{"name":"chat.file"}',
    );
  });

  test('returns null for a plain text message, so callers fall through to the body', () => {
    expect(attachmentPreviewText(null, null, t)).toBeNull();
    expect(attachmentPreviewText(undefined, undefined, t)).toBeNull();
  });
});

describe('fileIconName', () => {
  test.each([
    ['application/pdf', 'file-pdf'],
    ['application/msword', 'file-word'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'file-word'],
    ['application/zip', 'file-zipper'],
    ['application/x-compressed', 'file-zipper'],
    ['image/png', 'file-image'],
    ['audio/mp4', 'file-audio'],
    ['video/quicktime', 'file-video'],
    ['text/csv', 'file-lines'],
  ])('maps %s to %s', (mime, icon) => {
    expect(fileIconName(mime)).toBe(icon);
  });

  test('falls back to a generic icon for unknown or missing types', () => {
    expect(fileIconName('application/octet-stream')).toBe('file');
    expect(fileIconName(null)).toBe('file');
    expect(fileIconName(undefined)).toBe('file');
  });
});

describe('formatDuration', () => {
  test('pads seconds to two digits', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(59)).toBe('0:59');
  });

  test('rolls into minutes', () => {
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(600)).toBe('10:00');
  });

  // There is no hours tier - an hour-long call reads as 60:00. Recorded
  // as current behaviour rather than endorsed as ideal.
  test('keeps counting in minutes past an hour', () => {
    expect(formatDuration(3600)).toBe('60:00');
  });
});

describe('formatLastSeen', () => {
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

  test('falls back to a bare Offline when nothing was ever recorded', () => {
    expect(formatLastSeen(null, t)).toBe('chat.offline');
  });

  test('picks the coarsest tier that fits', () => {
    expect(formatLastSeen(minutesAgo(0), t)).toBe('chat.lastSeenJustNow');
    expect(formatLastSeen(minutesAgo(5), t)).toBe('chat.lastSeenMinutesAgo:{"count":5}');
    expect(formatLastSeen(minutesAgo(90), t)).toBe('chat.lastSeenHoursAgo:{"count":1}');
    expect(formatLastSeen(minutesAgo(60 * 24 * 3), t)).toBe('chat.lastSeenDaysAgo:{"count":3}');
  });

  test('does not report days as an absurd minute count', () => {
    expect(formatLastSeen(minutesAgo(60 * 24 * 3), t)).not.toContain('4320');
  });
});

describe('callStatusPreviewText', () => {
  test('labels each outcome', () => {
    expect(callStatusPreviewText('missed', null, t)).toBe('call.missedCallPreview');
    expect(callStatusPreviewText('declined', null, t)).toBe('call.declinedCallPreview');
  });

  test('includes the duration of a completed call, rounded to seconds', () => {
    expect(callStatusPreviewText('completed', 65_400, t)).toBe(
      'call.completedCallPreview:{"duration":"1:05"}',
    );
  });

  test('treats a completed call with no recorded duration as zero', () => {
    expect(callStatusPreviewText('completed', null, t)).toBe(
      'call.completedCallPreview:{"duration":"0:00"}',
    );
  });

  test('returns null when the message is not a call log', () => {
    expect(callStatusPreviewText(null, null, t)).toBeNull();
  });
});

describe('isSameDay', () => {
  test('compares local calendar days, not elapsed time', () => {
    expect(isSameDay('2026-09-10T00:10:00', '2026-09-10T23:50:00')).toBe(true);
    // Under 24h apart, but a day boundary sits between them.
    expect(isSameDay('2026-09-10T23:50:00', '2026-09-11T00:10:00')).toBe(false);
  });

  test('does not confuse the same day-of-month across months or years', () => {
    expect(isSameDay('2026-09-10T12:00:00', '2026-10-10T12:00:00')).toBe(false);
    expect(isSameDay('2025-09-10T12:00:00', '2026-09-10T12:00:00')).toBe(false);
  });
});

describe('formatMessageTime', () => {
  test('follows the locale for 12h vs 24h', () => {
    const at = new Date(2026, 8, 10, 15, 45).toISOString();
    expect(formatMessageTime(at, 'en-US')).toMatch(/3:45\s?PM/i);
    expect(formatMessageTime(at, 'bg-BG')).toContain('15:45');
  });

  test('pads the minutes', () => {
    expect(formatMessageTime(new Date(2026, 8, 10, 9, 5).toISOString(), 'bg-BG')).toContain(':05');
  });
});

describe('formatMessageDay', () => {
  const now = new Date(2026, 8, 10, 12, 0);
  const at = (y: number, m: number, d: number) => new Date(y, m, d, 12, 0).toISOString();

  test('names the two most recent days instead of dating them', () => {
    expect(formatMessageDay(at(2026, 8, 10), t, 'en-US', now)).toBe('chat.today');
    expect(formatMessageDay(at(2026, 8, 9), t, 'en-US', now)).toBe('chat.yesterday');
  });

  test('is based on calendar days, not 24h windows', () => {
    // 00:05 today is barely 12 hours before `now`, but it is still today.
    const earlyToday = new Date(2026, 8, 10, 0, 5).toISOString();
    expect(formatMessageDay(earlyToday, t, 'en-US', now)).toBe('chat.today');
  });

  test('dates anything older, omitting the year within the current one', () => {
    const thisYear = formatMessageDay(at(2026, 2, 4), t, 'en-US', now);
    expect(thisYear).toContain('March');
    expect(thisYear).not.toContain('2026');
  });

  test('includes the year once it differs', () => {
    expect(formatMessageDay(at(2025, 2, 4), t, 'en-US', now)).toContain('2025');
  });
});

describe('messageIdsStartingADay', () => {
  const at = (iso: string, id: string) => ({ id, created_at: iso });

  test('marks the first message of each day, reading newest-first', () => {
    // Rendered top-to-bottom this is m1 (9th), then m2 and m3 (10th).
    const newestFirst = [
      at('2026-09-10T18:00:00', 'm3'),
      at('2026-09-10T09:00:00', 'm2'),
      at('2026-09-09T22:00:00', 'm1'),
    ];

    expect(messageIdsStartingADay(newestFirst)).toEqual(new Set(['m2', 'm1']));
  });

  test('always marks the oldest loaded message', () => {
    const sameDay = [
      at('2026-09-10T18:00:00', 'm2'),
      at('2026-09-10T09:00:00', 'm1'),
    ];

    expect(messageIdsStartingADay(sameDay)).toEqual(new Set(['m1']));
  });

  test('handles a single message and an empty list', () => {
    expect(messageIdsStartingADay([at('2026-09-10T18:00:00', 'm1')])).toEqual(new Set(['m1']));
    expect(messageIdsStartingADay([]).size).toBe(0);
  });
});
