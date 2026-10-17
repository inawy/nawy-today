import { describe, expect, it } from 'vitest';
import { buildMonthModel, daySpan } from '@/features/month';
import type { MonthInput } from '@/features/month';
import { makeAllDayEvent, makeCalendar, makeEvent } from '../helpers/factories';

const base = (over: Partial<MonthInput> = {}): MonthInput => ({
  calendars: [makeCalendar()],
  events: [],
  year: 2026,
  month: 10,
  weekStart: 6,
  maxLanes: 3,
  ...over,
});

const allBars = (m: ReturnType<typeof buildMonthModel>) => m.weeks.flatMap((w) => w.bars);

describe('buildMonthModel: grid', () => {
  it('is always six weeks of seven days, starting on the chosen weekday', () => {
    const sat = buildMonthModel(base({ weekStart: 6 }));
    expect(sat.weeks).toHaveLength(6);
    expect(sat.weeks.every((w) => w.days.length === 7)).toBe(true);
    expect(sat.weeks[0]?.days[0]).toBe('2026-09-26'); // a Saturday; 1 Oct 2026 is a Thursday
    const mon = buildMonthModel(base({ weekStart: 1 }));
    expect(mon.weeks[0]?.days[0]).toBe('2026-09-28');
  });
});

describe('buildMonthModel: events', () => {
  it('draws a timed single-day event with its time shown', () => {
    const m = buildMonthModel(base({ events: [makeEvent()] }));
    const bars = allBars(m);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ showTime: true, lane: 0, calendarColor: 'blue' });
    expect(bars[0]?.startCol).toBe(bars[0]?.endCol);
  });

  it('stretches an all-day multi-day event over its days only (exclusive end)', () => {
    const trip = makeAllDayEvent({ start: '2026-10-20', end: '2026-10-23' });
    const bars = allBars(buildMonthModel(base({ events: [trip] })));
    expect(bars).toHaveLength(1);
    expect((bars[0]?.endCol ?? 0) - (bars[0]?.startCol ?? 0)).toBe(2);
    expect(bars[0]?.showTime).toBe(false);
  });

  it('splits an event that crosses a week boundary into two open-ended pieces', () => {
    // Fri 2026-10-02 → Sun 2026-10-04 with weeks starting Saturday: Fri is in week 0, Sat+Sun in week 1.
    const e = makeAllDayEvent({ start: '2026-10-02', end: '2026-10-05' });
    const m = buildMonthModel(base({ events: [e] }));
    const week0 = m.weeks[0]?.bars[0];
    const week1 = m.weeks[1]?.bars[0];
    expect(week0).toMatchObject({ continuesBefore: false, continuesAfter: true });
    expect(week1).toMatchObject({ continuesBefore: true, continuesAfter: false });
  });

  it('does not draw an event that ends exactly at midnight on the next day', () => {
    const e = makeEvent({ start: '2026-10-13T22:00', end: '2026-10-14T00:00' });
    const [bar] = allBars(buildMonthModel(base({ events: [e] })));
    expect(bar?.startCol).toBe(bar?.endCol);
  });

  it('expands repeating events inside the grid, including days of neighbouring months', () => {
    const daily = makeEvent({
      rrule: 'FREQ=DAILY',
      start: '2026-09-20T09:00',
      end: '2026-09-20T10:00',
    });
    const m = buildMonthModel(base({ events: [daily], maxLanes: 3 }));
    expect(allBars(m)).toHaveLength(42); // every cell, one bar each
    expect(m.weeks[0]?.bars).toHaveLength(7);
  });

  it('shows "+N" instead of drawing more than maxLanes', () => {
    const events = ['a', 'b', 'c', 'd'].map((id) => makeEvent({ id, title: id }));
    const m = buildMonthModel(base({ events, maxLanes: 3 }));
    const week = m.weeks.find((w) => w.hidden.some((n) => n > 0));
    expect(week?.hidden.find((n) => n > 0)).toBe(2);
    expect(week?.bars).toHaveLength(2);
  });

  it('leaves out events of hidden calendars without calling them damaged', () => {
    const m = buildMonthModel(
      base({ calendars: [makeCalendar({ visible: false })], events: [makeEvent()] }),
    );
    expect(allBars(m)).toHaveLength(0);
    expect(m.skipped).toBe(0);
  });

  it('uses the event colour over the calendar colour', () => {
    const [bar] = allBars(buildMonthModel(base({ events: [makeEvent({ color: 'red' })] })));
    expect(bar?.calendarColor).toBe('red');
  });
});

describe('buildMonthModel: damaged data never throws', () => {
  it('skips and counts records that fail validation', () => {
    const m = buildMonthModel(
      base({
        calendars: [makeCalendar(), { id: 'broken' }, null],
        events: [
          makeEvent(),
          { id: 'x', title: 42 },
          'nonsense',
          makeEvent({ id: 'orphan', calendarId: 'no-such-calendar' }),
          { ...makeEvent({ id: 'bad-date' }), start: 'tomorrow-ish' },
        ],
      }),
    );
    expect(allBars(m)).toHaveLength(1);
    expect(m.skipped).toBe(2 /* calendars */ + 4 /* events */);
  });

  it('reports a repeating event with an unsupported rule and still shows it once', () => {
    const m = buildMonthModel(base({ events: [makeEvent({ rrule: 'FREQ=HOURLY' })] }));
    expect(m.problems).toHaveLength(1);
    expect(allBars(m)).toHaveLength(1);
  });
});

describe('daySpan', () => {
  const occ = (event: ReturnType<typeof makeEvent>) =>
    ({ event, start: event.start, end: event.end }) as Parameters<typeof daySpan>[0];

  it('never ends before it starts', () => {
    const e = makeEvent({ start: '2026-10-13T09:00', end: '2026-10-13T09:00' });
    const s = daySpan(occ(e));
    expect(s?.endDay).toBe(s?.startDay);
    const z = makeAllDayEvent({ start: '2026-10-13', end: '2026-10-13' });
    expect(daySpan(occ(z))?.endDay).toBe(daySpan(occ(z))?.startDay);
  });

  it('returns undefined for malformed dates', () => {
    expect(daySpan(occ({ ...makeEvent(), start: 'x' }))).toBeUndefined();
  });
});
