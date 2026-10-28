import { describe, expect, it } from 'vitest';
import { buildYearModel } from '@/features/year';
import type { YearInput } from '@/features/year';
import { makeAllDayEvent, makeCalendar, makeEvent } from '../helpers/factories';

const base = (over: Partial<YearInput> = {}): YearInput => ({
  calendars: [makeCalendar()],
  events: [],
  year: 2026,
  weekStart: 6,
  ...over,
});

const countOn = (m: ReturnType<typeof buildYearModel>, date: string): number | undefined =>
  m.months
    .flatMap((x) => x.weeks.flat())
    .find((d) => d.inMonth && d.date === date)?.count;

describe('buildYearModel: shape', () => {
  it('has twelve months of real days only, in rows that hold at least one of them', () => {
    const m = buildYearModel(base());
    expect(m.months.map((x) => x.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const days = m.months.flatMap((x) => x.weeks.flat().filter((d) => d.inMonth));
    expect(days).toHaveLength(365);
    for (const month of m.months) {
      expect(month.weeks.length).toBeGreaterThanOrEqual(4);
      expect(month.weeks.length).toBeLessThanOrEqual(6);
      expect(month.weeks.every((w) => w.length === 7)).toBe(true);
      expect(month.weeks.every((w) => w.some((d) => d.inMonth))).toBe(true);
    }
  });

  it('counts a leap year as 366 days and starts rows on the chosen weekday', () => {
    const leap = buildYearModel(base({ year: 2028, weekStart: 1 }));
    expect(leap.months.flatMap((x) => x.weeks.flat().filter((d) => d.inMonth))).toHaveLength(366);
    // 1 Oct 2026 is a Thursday: with weeks starting on Monday it is the fourth cell.
    const oct = buildYearModel(base({ weekStart: 1 })).months[9];
    expect(oct?.weeks[0]?.[3]).toMatchObject({ date: '2026-10-01', inMonth: true });
    expect(oct?.weeks[0]?.[0]?.inMonth).toBe(false);
  });
});

describe('buildYearModel: counts', () => {
  it('counts events on their day and nothing elsewhere', () => {
    const m = buildYearModel(base({ events: [makeEvent(), makeEvent({ id: 'ev-2' })] }));
    expect(countOn(m, '2026-10-13')).toBe(2);
    expect(countOn(m, '2026-10-14')).toBe(0);
  });

  it('counts a multi-day all-day event on each of its days (exclusive end)', () => {
    const trip = makeAllDayEvent({ start: '2026-10-20', end: '2026-10-23' });
    const m = buildYearModel(base({ events: [trip] }));
    expect([20, 21, 22, 23].map((d) => countOn(m, `2026-10-${d}`))).toEqual([1, 1, 1, 0]);
  });

  it('keeps the part of an event that crosses the year boundary', () => {
    const holiday = makeAllDayEvent({ start: '2026-12-30', end: '2027-01-03' });
    expect(countOn(buildYearModel(base({ events: [holiday] })), '2026-12-31')).toBe(1);
    const next = buildYearModel(base({ year: 2027, events: [holiday] }));
    expect([1, 2, 3].map((d) => countOn(next, `2027-01-0${d}`))).toEqual([1, 1, 0]);
  });

  it('repeats a weekly event through the whole year', () => {
    const weekly = makeEvent({
      rrule: 'FREQ=WEEKLY',
      start: '2026-01-06T09:00',
      end: '2026-01-06T10:00',
    });
    const m = buildYearModel(base({ events: [weekly] }));
    const days = m.months.flatMap((x) => x.weeks.flat().filter((d) => d.inMonth && d.count > 0));
    expect(days.length).toBeGreaterThanOrEqual(50);
    expect(countOn(m, '2026-10-13')).toBe(1);
    expect(countOn(m, '2026-10-12')).toBe(0);
  });

  it('leaves out events of hidden calendars and counts damaged records', () => {
    const hidden = buildYearModel(
      base({ calendars: [makeCalendar({ visible: false })], events: [makeEvent()] }),
    );
    expect(countOn(hidden, '2026-10-13')).toBe(0);
    expect(hidden.skipped).toBe(0);

    const damaged = buildYearModel(base({ events: [makeEvent(), { id: 'broken' }] }));
    expect(damaged.skipped).toBe(1);
    expect(countOn(damaged, '2026-10-13')).toBe(1);
  });
});
