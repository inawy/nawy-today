import { describe, expect, it } from 'vitest';
import { MIN_RESIZE_MINUTES, draftForNew, moveDraft, resizeDraft } from '@/features/events';
import type { Draft } from '@/features/events';
import { dragDelta, keyAction } from '@/features/timegrid';

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

describe('dragDelta in the month grid', () => {
  const month = { columnWidth: 100, hourPx: 1, rtl: false, stepMinutes: 15, rowHeight: 120 };

  it('turns up and down into whole weeks and never into minutes', () => {
    expect(dragDelta({ ...month, dx: 0, dy: 70 })).toEqual({ days: 7, minutes: 0 });
    expect(dragDelta({ ...month, dx: 0, dy: 50 })).toEqual({ days: 0, minutes: 0 });
    expect(dragDelta({ ...month, dx: 0, dy: -130 })).toEqual({ days: -7, minutes: 0 });
  });

  it('adds sideways days to the weeks, and mirrors them for right-to-left', () => {
    expect(dragDelta({ ...month, dx: 210, dy: 125 })).toEqual({ days: 9, minutes: 0 });
    expect(dragDelta({ ...month, rtl: true, dx: 210, dy: 125 })).toEqual({ days: 5, minutes: 0 });
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

describe('keyAction', () => {
  const mods = { shift: true, ctrl: false, alt: false, meta: false };

  it('moves a step earlier or later with Shift + up/down', () => {
    expect(keyAction('ArrowUp', mods, false)).toEqual({ kind: 'move', days: 0, minutes: -15 });
    expect(keyAction('ArrowDown', mods, true)).toEqual({ kind: 'move', days: 0, minutes: 15 });
  });

  it('moves a day the way the arrow points on screen, in both directions of writing', () => {
    expect(keyAction('ArrowRight', mods, false)).toEqual({ kind: 'move', days: 1, minutes: 0 });
    expect(keyAction('ArrowLeft', mods, false)).toEqual({ kind: 'move', days: -1, minutes: 0 });
    // Right-to-left: days run from the right, so → goes back in time.
    expect(keyAction('ArrowRight', mods, true)).toEqual({ kind: 'move', days: -1, minutes: 0 });
    expect(keyAction('ArrowLeft', mods, true)).toEqual({ kind: 'move', days: 1, minutes: 0 });
  });

  it('resizes only the end with Ctrl + Shift + up/down', () => {
    const ctrl = { ...mods, ctrl: true };
    expect(keyAction('ArrowDown', ctrl, false)).toEqual({ kind: 'resize', minutes: 15 });
    expect(keyAction('ArrowUp', ctrl, false)).toEqual({ kind: 'resize', minutes: -15 });
    expect(keyAction('ArrowLeft', ctrl, false)).toBeUndefined();
  });

  it('ignores plain arrows, other keys and Alt/Meta combinations', () => {
    expect(keyAction('ArrowDown', { ...mods, shift: false }, false)).toBeUndefined();
    expect(keyAction('KeyA', mods, false)).toBeUndefined();
    expect(keyAction('ArrowDown', { ...mods, alt: true }, false)).toBeUndefined();
    expect(keyAction('ArrowDown', { ...mods, meta: true }, false)).toBeUndefined();
  });
});
