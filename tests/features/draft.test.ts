// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  draftForNew,
  draftFromEvent,
  draftToFields,
  isDirty,
  repeatFromRule,
  repeatToRule,
  withStart,
} from '@/features/events/draft';
import type { Draft } from '@/features/events/draft';
import { makeAllDayEvent, makeEvent } from '../helpers/factories';

const fresh = (over: Partial<Draft> = {}): Draft => ({
  ...draftForNew({ date: '2026-10-13', calendarId: 'cal-1', tzid: 'Asia/Riyadh' }),
  title: 'Standup',
  ...over,
});

describe('draftForNew', () => {
  it('defaults to a one-hour event at 09:00', () => {
    const d = draftForNew({ date: '2026-10-13', calendarId: 'c', tzid: 'Asia/Riyadh' });
    expect([d.startTime, d.endTime, d.endDate]).toEqual(['09:00', '10:00', '2026-10-13']);
  });

  it('never runs past midnight when started late', () => {
    const d = draftForNew({ date: '2026-10-13', time: '23:30', calendarId: 'c', tzid: 'UTC' });
    expect(d.endTime).toBe('23:59');
    expect(draftToFields({ ...d, title: 'x' }).ok).toBe(true);
  });
});

describe('draftToFields', () => {
  it('builds a timed event with the zone and trims text', () => {
    const r = draftToFields(fresh({ title: '  Standup ', notes: ' ', location: ' Office ' }));
    expect(r).toEqual({
      ok: true,
      fields: {
        calendarId: 'cal-1',
        title: 'Standup',
        allDay: false,
        start: '2026-10-13T09:00',
        end: '2026-10-13T10:00',
        location: 'Office',
        tzid: 'Asia/Riyadh',
      },
    });
  });

  it('allows an empty title (shown as untitled)', () => {
    expect(draftToFields(fresh({ title: '' })).ok).toBe(true);
  });

  it('all-day: the form end is the last day, storage end is exclusive, and no zone', () => {
    const r = draftToFields(fresh({ allDay: true, endDate: '2026-10-15' }));
    expect(r).toMatchObject({
      ok: true,
      fields: { allDay: true, start: '2026-10-13', end: '2026-10-16' },
    });
    expect(r.ok && 'tzid' in r.fields).toBe(false);
  });

  it('names the reason for every kind of invalid input', () => {
    const err = (over: Partial<Draft>) => {
      const r = draftToFields(fresh(over));
      return r.ok ? 'ok' : r.error;
    };
    expect(err({ calendarId: '' })).toBe('calendar');
    expect(err({ startDate: '2026-02-30' })).toBe('start');
    expect(err({ endDate: 'x' })).toBe('end');
    expect(err({ startTime: '9:00' })).toBe('start');
    expect(err({ endTime: '08:00' })).toBe('order');
    expect(err({ allDay: true, endDate: '2026-10-12' })).toBe('order');
    expect(err({ tzid: 'Nowhere/Land' })).toBe('timezone');
    expect(err({ title: 'x'.repeat(501) })).toBe('title-too-long');
  });

  it('a zero-length event is allowed', () => {
    expect(draftToFields(fresh({ endTime: '09:00' })).ok).toBe(true);
  });
});

describe('repeat <-> rule', () => {
  const start = '2026-10-13'; // Tuesday, 2nd Tuesday of the month

  it('builds the common rules', () => {
    const build = (over: object, allDay = false) =>
      repeatToRule({ ...fresh().repeat, ...over } as Draft['repeat'], start, allDay);
    expect(build({ kind: 'daily' })).toEqual({ ok: true, rrule: 'FREQ=DAILY' });
    expect(build({ kind: 'daily', interval: 3, end: { kind: 'count', count: 5 } })).toEqual({
      ok: true,
      rrule: 'FREQ=DAILY;INTERVAL=3;COUNT=5',
    });
    expect(build({ kind: 'weekly' })).toEqual({ ok: true, rrule: 'FREQ=WEEKLY;BYDAY=TU' });
    expect(build({ kind: 'weekly', weekdays: [5, 1] })).toEqual({
      ok: true,
      rrule: 'FREQ=WEEKLY;BYDAY=MO,FR',
    });
    expect(build({ kind: 'monthly' })).toEqual({ ok: true, rrule: 'FREQ=MONTHLY;BYMONTHDAY=13' });
    expect(build({ kind: 'monthly', monthlyMode: 'nth' })).toEqual({
      ok: true,
      rrule: 'FREQ=MONTHLY;BYDAY=2TU',
    });
    expect(build({ kind: 'yearly' })).toEqual({
      ok: true,
      rrule: 'FREQ=YEARLY;BYMONTH=10;BYMONTHDAY=13',
    });
  });

  it('until is a date for all-day and end-of-day for timed events', () => {
    const r = {
      ...fresh().repeat,
      kind: 'daily',
      end: { kind: 'until', date: '2026-10-20' },
    } as const;
    expect(repeatToRule(r, start, true)).toEqual({ ok: true, rrule: 'FREQ=DAILY;UNTIL=20261020' });
    expect(repeatToRule(r, start, false)).toEqual({
      ok: true,
      rrule: 'FREQ=DAILY;UNTIL=20261020T235900',
    });
  });

  it('rejects impossible settings with a reason', () => {
    const base = { ...fresh().repeat, kind: 'daily' } as const;
    expect(repeatToRule({ ...base, interval: 0 }, start, false)).toEqual({
      ok: false,
      error: 'interval',
    });
    expect(repeatToRule({ ...base, end: { kind: 'count', count: 0 } }, start, false)).toEqual({
      ok: false,
      error: 'count',
    });
    expect(
      repeatToRule({ ...base, end: { kind: 'until', date: '2026-10-01' } }, start, false),
    ).toEqual({ ok: false, error: 'until' });
  });

  it('an untouched stored rule comes back byte for byte', () => {
    for (const rule of ['FREQ=MONTHLY', 'FREQ=WEEKLY;BYDAY=TU;COUNT=4', 'FREQ=YEARLY']) {
      const r = repeatFromRule(rule, start);
      expect(repeatToRule(r, start, false)).toEqual({ ok: true, rrule: rule });
    }
  });

  it('classifies what the form can show, and keeps the rest as custom', () => {
    expect(repeatFromRule('FREQ=DAILY;INTERVAL=2', start).kind).toBe('daily');
    expect(repeatFromRule('FREQ=WEEKLY;BYDAY=MO,WE', start)).toMatchObject({
      kind: 'weekly',
      weekdays: [1, 3],
    });
    expect(repeatFromRule('FREQ=MONTHLY;BYMONTHDAY=13', start)).toMatchObject({
      kind: 'monthly',
      monthlyMode: 'day',
    });
    expect(repeatFromRule('FREQ=MONTHLY;BYDAY=2TU', start)).toMatchObject({
      kind: 'monthly',
      monthlyMode: 'nth',
    });
    expect(repeatFromRule('FREQ=MONTHLY;BYMONTHDAY=1,15', start).kind).toBe('custom');
    expect(repeatFromRule('FREQ=WEEKLY;BYDAY=MO;WKST=SU', start).kind).toBe('custom');
    expect(repeatFromRule('garbage', start).kind).toBe('custom');
    expect(repeatFromRule(undefined, start).kind).toBe('none');
  });

  it('a custom rule is kept untouched when the form is saved', () => {
    const r = repeatFromRule('FREQ=MONTHLY;BYMONTHDAY=1,15', start);
    expect(repeatToRule(r, start, false)).toEqual({
      ok: true,
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=1,15',
    });
  });

  it('the fifth weekday means "the last"', () => {
    const r = { ...fresh().repeat, kind: 'monthly', monthlyMode: 'nth' } as const;
    expect(repeatToRule(r, '2026-11-29', false)).toEqual({
      ok: true,
      rrule: 'FREQ=MONTHLY;BYDAY=-1SU',
    });
  });
});

describe('draftFromEvent', () => {
  it('shows the occurrence, not the series start', () => {
    const e = makeEvent({ rrule: 'FREQ=DAILY' });
    const d = draftFromEvent(e, { start: '2026-10-20T09:00', end: '2026-10-20T10:00' }, 'UTC');
    expect([d.startDate, d.startTime, d.endTime, d.tzid]).toEqual([
      '2026-10-20',
      '09:00',
      '10:00',
      'Asia/Riyadh',
    ]);
    expect(d.repeat.kind).toBe('daily');
  });

  it('turns the exclusive all-day end back into the last day', () => {
    const e = makeAllDayEvent({ start: '2026-10-13', end: '2026-10-16' });
    const d = draftFromEvent(e, { start: e.start, end: e.end }, 'UTC');
    expect([d.allDay, d.startDate, d.endDate, d.tzid]).toEqual([
      true,
      '2026-10-13',
      '2026-10-15',
      'UTC',
    ]);
  });

  it('round-trips an event without changes', () => {
    const e = makeEvent({ notes: 'n', location: 'l', rrule: 'FREQ=WEEKLY;BYDAY=TU' });
    const d = draftFromEvent(e, { start: e.start, end: e.end }, 'UTC');
    const r = draftToFields(d);
    expect(r).toMatchObject({
      ok: true,
      fields: {
        title: 'Meeting',
        notes: 'n',
        location: 'l',
        start: e.start,
        end: e.end,
        rrule: 'FREQ=WEEKLY;BYDAY=TU',
      },
    });
    expect(isDirty(d, structuredClone(d))).toBe(false);
    expect(isDirty(d, { ...d, title: 'x' })).toBe(true);
  });

  it('round-trips an all-day event', () => {
    const e = makeAllDayEvent({ start: '2026-10-13', end: '2026-10-16' });
    const r = draftToFields(draftFromEvent(e, { start: e.start, end: e.end }, 'UTC'));
    expect(r).toMatchObject({
      ok: true,
      fields: { allDay: true, start: '2026-10-13', end: '2026-10-16' },
    });
  });
});

describe('withStart', () => {
  it('keeps the length when the start time moves', () => {
    const d = withStart(fresh({ endTime: '10:30' }), { startTime: '14:00' });
    expect([d.startTime, d.endTime, d.endDate]).toEqual(['14:00', '15:30', '2026-10-13']);
  });

  it('keeps the length across days when the start date moves', () => {
    const d = withStart(fresh({ endDate: '2026-10-14' }), { startDate: '2026-10-20' });
    expect([d.startDate, d.endDate]).toEqual(['2026-10-20', '2026-10-21']);
  });

  it('stops at the end of the day instead of wrapping', () => {
    const d = withStart(fresh({ endTime: '10:00' }), { startTime: '23:30' });
    expect(d.endTime).toBe('23:59');
  });

  it('ignores a half-typed value', () => {
    const d = withStart(fresh(), { startDate: '2026-1' });
    expect([d.startDate, d.endDate]).toEqual(['2026-1', '2026-10-13']);
  });
});
