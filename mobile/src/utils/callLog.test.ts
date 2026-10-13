import { callDirection, groupCallLog, type CallLogItem } from './callLog';

const ME = 'me';

let seq = 0;
function call(partial: Partial<CallLogItem> & Pick<CallLogItem, 'created_at'>): CallLogItem {
  seq += 1;
  return {
    id: `c${seq}`,
    conversation_id: 'conv-a',
    sender_id: 'other',
    call_status: 'completed',
    ...partial,
  };
}

describe('callDirection', () => {
  it('is outgoing for calls I placed, whatever happened', () => {
    expect(callDirection(call({ created_at: '2026-10-01T10:00:00', sender_id: ME, call_status: 'missed' }), ME)).toBe('outgoing');
  });

  it('is missed only for a missed call someone else placed', () => {
    expect(callDirection(call({ created_at: '2026-10-01T10:00:00', call_status: 'missed' }), ME)).toBe('missed');
    expect(callDirection(call({ created_at: '2026-10-01T10:00:00', call_status: 'declined' }), ME)).toBe('incoming');
  });
});

describe('groupCallLog', () => {
  it('splits by local day, newest first', () => {
    const days = groupCallLog(
      [
        call({ created_at: '2026-10-02T18:00:00' }),
        call({ created_at: '2026-10-01T21:00:00' }),
        call({ created_at: '2026-10-01T09:00:00' }),
      ],
      ME,
    );
    expect(days.map((d) => d.rows.length)).toEqual([1, 2]);
  });

  it('collapses repeated unanswered tries at the same person', () => {
    const [day] = groupCallLog(
      [
        call({ created_at: '2026-10-01T20:58:00', sender_id: ME, call_status: 'missed' }),
        call({ created_at: '2026-10-01T20:55:00', sender_id: ME, call_status: 'missed' }),
        call({ created_at: '2026-10-01T20:41:00', call_status: 'missed' }),
        call({ created_at: '2026-10-01T20:40:00', call_status: 'missed' }),
      ],
      ME,
    );
    expect(day.rows.map((r) => [r.direction, r.count])).toEqual([
      ['outgoing', 2],
      ['missed', 2],
    ]);
  });

  it('keeps completed calls separate, and different people apart', () => {
    const [day] = groupCallLog(
      [
        call({ created_at: '2026-10-01T21:15:00' }),
        call({ created_at: '2026-10-01T21:09:00' }),
        call({ created_at: '2026-10-01T21:00:00', conversation_id: 'conv-b', call_status: 'missed' }),
        call({ created_at: '2026-10-01T20:59:00', call_status: 'missed' }),
      ],
      ME,
    );
    expect(day.rows.map((r) => r.count)).toEqual([1, 1, 1, 1]);
  });
});
