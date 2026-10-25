import { describe, expect, it } from 'vitest';
import { MIN_RESIZE_MINUTES, draftForNew, moveDraft, resizeDraft } from '@/features/events';
import type { Draft } from '@/features/events';
import { dragDelta } from '@/features/timegrid';

const timed = (over: Partial<Draft> = {}): Draft => ({
  ...draftForNew({ date: '2026-10-20', time: '09:00', calendarId: 'cal', tzid: 'Asia/Riyadh' }),
  allDay: false,
  startDate: '2026-10-20',
  startTime: '09:00',
  endDate: '2026-10-20',
  endTime: '10:00',
  ...over,
});

describe('resizeDraft', () => {
  it('moves only the end, longer or shorter, and keeps the start', () => {
    expect(resizeDraft(timed(), 45)).toMatchObject({
      startDate: '2026-10-20',
      startTime: '09:00',
      endTime: '10:45',
    });
    expect(resizeDraft(timed(), -30)).toMatchObject({ startTime: '09:00', endTime: '09:30' });
  });

  it('never makes the event shorter than one step', () => {
    expect(resizeDraft(timed(), -600)).toMatchObject({
      startTime: '09:00',
      endTime: '09:15',
    });
    expect(MIN_RESIZE_MINUTES).toBe(15);
  });

  it('may carry the end across midnight', () => {
    expect(resizeDraft(timed({ startTime: '22:30', endTime: '23:30' }), 90)).toMatchObject({
      startDate: '2026-10-20',
      endDate: '2026-10-21',
      endTime: '01:00',
    });
  });

  it('leaves all-day events and unreadable times alone', () => {
    expect(resizeDraft(timed({ allDay: true }), 30)).toBeUndefined();
    expect(resizeDraft(timed({ endTime: 'xx' }), 30)).toBeUndefined();
  });
});

describe('moveDraft', () => {
  it('moves a timed event by minutes and keeps its length', () => {
    const moved = moveDraft(timed(), 0, 90);
    expect(moved).toMatchObject({ startTime: '10:30', endTime: '11:30', startDate: '2026-10-20' });
  });

  it('carries across midnight, in both directions', () => {
    const late = moveDraft(timed({ startTime: '23:00', endTime: '23:30' }), 0, 60);
    expect(late).toMatchObject({
      startDate: '2026-10-21',
      startTime: '00:00',
      endDate: '2026-10-21',
      endTime: '00:30',
    });
    const early = moveDraft(timed({ startTime: '00:15', endTime: '01:00' }), 0, -30);
    expect(early).toMatchObject({ startDate: '2026-10-19', startTime: '23:45' });
  });

  it('moves by days and minutes together', () => {
    expect(moveDraft(timed(), 2, -60)).toMatchObject({
      startDate: '2026-10-22',
      startTime: '08:00',
      endTime: '09:00',
    });
  });

  it('moves a multi-day timed event as a whole', () => {
    const moved = moveDraft(timed({ endDate: '2026-10-22', endTime: '12:00' }), 1, 0);
    expect(moved).toMatchObject({
      startDate: '2026-10-21',
      endDate: '2026-10-23',
      endTime: '12:00',
    });
  });

  it('moves an all-day event by days only (its last day is inclusive)', () => {
    const base = timed({ allDay: true, startDate: '2026-10-20', endDate: '2026-10-22' });
    expect(moveDraft(base, 3, 45)).toMatchObject({
      startDate: '2026-10-23',
      endDate: '2026-10-25',
    });
  });

  it('refuses to move something it cannot read', () => {
    expect(moveDraft(timed({ startTime: 'nope' }), 0, 15)).toBeUndefined();
  });
});

describe('dragDelta', () => {
  const base = { columnWidth: 100, hourPx: 48, rtl: false, stepMinutes: 15 };

  it('catches time to 15 minutes', () => {
    expect(dragDelta({ ...base, dx: 0, dy: 12 })).toEqual({ days: 0, minutes: 15 });
    expect(dragDelta({ ...base, dx: 0, dy: 5 })).toEqual({ days: 0, minutes: 0 });
    expect(dragDelta({ ...base, dx: 0, dy: -48 })).toEqual({ days: 0, minutes: -60 });
  });

  it('moves a day once the pointer passes half a column', () => {
    expect(dragDelta({ ...base, dx: 49, dy: 0 }).days).toBe(0);
    expect(dragDelta({ ...base, dx: 51, dy: 0 }).days).toBe(1);
    expect(dragDelta({ ...base, dx: -160, dy: 0 }).days).toBe(-2);
  });

  it('mirrors days for right-to-left pages', () => {
    expect(dragDelta({ ...base, rtl: true, dx: 120, dy: 0 }).days).toBe(-1);
    expect(dragDelta({ ...base, rtl: true, dx: -120, dy: 0 }).days).toBe(1);
  });
});
