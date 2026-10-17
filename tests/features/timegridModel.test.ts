import { describe, expect, it } from 'vitest';
import { buildTimeGridModel } from '@/features/timegrid';
import type { TimeGridInput } from '@/features/timegrid';
import { makeAllDayEvent, makeCalendar, makeEvent } from '../helpers/factories';

const WEEK = [
  '2026-10-12',
  '2026-10-13',
  '2026-10-14',
  '2026-10-15',
  '2026-10-16',
  '2026-10-17',
  '2026-10-18',
];

const input = (over: Partial<TimeGridInput> = {}): TimeGridInput => ({
  calendars: [makeCalendar()],
  events: [],
  days: WEEK,
  maxAllDayLanes: 3,
  ...over,
});

describe('buildTimeGridModel: timed events', () => {
  it('places an event as fractions of the day', () => {
    const m = buildTimeGridModel(input({ events: [makeEvent()] })); // Tue 09:00–10:00
    const tuesday = m.days[1];
    expect(tuesday?.date).toBe('2026-10-13');
    expect(tuesday?.blocks).toHaveLength(1);
    expect(tuesday?.blocks[0]).toMatchObject({
      top: 540 / 1440,
      height: 60 / 1440,
      column: 0,
      columnCount: 1,
      span: 1,
      startsBefore: false,
      endsAfter: false,
      calendarColor: 'blue',
    });
    expect(m.days.filter((d) => d.blocks.length > 0)).toHaveLength(1);
  });

  it('puts overlapping events side by side and leaves others at full width', () => {
    const events = [
      makeEvent({ id: 'a', title: 'A', start: '2026-10-13T09:00', end: '2026-10-13T11:00' }),
      makeEvent({ id: 'b', title: 'B', start: '2026-10-13T10:00', end: '2026-10-13T12:00' }),
      makeEvent({ id: 'c', title: 'C', start: '2026-10-13T15:00', end: '2026-10-13T16:00' }),
    ];
    const blocks = buildTimeGridModel(input({ events })).days[1]?.blocks ?? [];
    const by = Object.fromEntries(blocks.map((b) => [b.occurrence.event.id, b]));
    expect(by['a']).toMatchObject({ column: 0, columnCount: 2 });
    expect(by['b']).toMatchObject({ column: 1, columnCount: 2 });
    expect(by['c']).toMatchObject({ column: 0, columnCount: 1 });
  });

  it('shows an event across midnight on both days, flagged as continuing', () => {
    const e = makeEvent({ start: '2026-10-13T22:00', end: '2026-10-14T02:00' });
    const m = buildTimeGridModel(input({ events: [e] }));
    expect(m.days[1]?.blocks[0]).toMatchObject({
      top: 1320 / 1440,
      height: 120 / 1440,
      startsBefore: false,
      endsAfter: true,
    });
    expect(m.days[2]?.blocks[0]).toMatchObject({
      top: 0,
      height: 120 / 1440,
      startsBefore: true,
      endsAfter: false,
    });
  });

  it('does not show an event that ends exactly at midnight on the next day', () => {
    const e = makeEvent({ start: '2026-10-13T22:00', end: '2026-10-14T00:00' });
    const m = buildTimeGridModel(input({ events: [e] }));
    expect(m.days[2]?.blocks).toHaveLength(0);
    expect(m.days[1]?.blocks[0]?.endsAfter).toBe(false);
  });

  it('gives a very short event a visible height', () => {
    const e = makeEvent({ start: '2026-10-13T09:00', end: '2026-10-13T09:00' });
    const block = buildTimeGridModel(input({ events: [e] })).days[1]?.blocks[0];
    expect(block?.height).toBe(15 / 1440);
  });

  it('expands a repeating event on each matching day of the shown range', () => {
    const e = makeEvent({
      rrule: 'FREQ=DAILY;INTERVAL=2',
      start: '2026-10-12T09:00',
      end: '2026-10-12T10:00',
    });
    const m = buildTimeGridModel(input({ events: [e] }));
    expect(m.days.map((d) => d.blocks.length)).toEqual([1, 0, 1, 0, 1, 0, 1]);
  });

  it('sorts blocks of a day by time', () => {
    const events = [
      makeEvent({ id: 'late', start: '2026-10-13T15:00', end: '2026-10-13T16:00' }),
      makeEvent({ id: 'early', start: '2026-10-13T08:00', end: '2026-10-13T09:00' }),
    ];
    const blocks = buildTimeGridModel(input({ events })).days[1]?.blocks ?? [];
    expect(blocks.map((b) => b.occurrence.event.id)).toEqual(['early', 'late']);
  });
});

describe('buildTimeGridModel: all-day row', () => {
  it('keeps all-day events out of the grid and draws them as bars over their days', () => {
    const trip = makeAllDayEvent({ start: '2026-10-14', end: '2026-10-17' });
    const m = buildTimeGridModel(input({ events: [trip] }));
    expect(m.days.every((d) => d.blocks.length === 0)).toBe(true);
    expect(m.allDay.bars).toHaveLength(1);
    expect(m.allDay.bars[0]).toMatchObject({ startCol: 2, endCol: 4, lane: 0 });
  });

  it('clips a long event to the shown days and marks the open edges', () => {
    const long = makeAllDayEvent({ start: '2026-10-01', end: '2026-11-01' });
    const [bar] = buildTimeGridModel(input({ events: [long] })).allDay.bars;
    expect(bar).toMatchObject({
      startCol: 0,
      endCol: 6,
      continuesBefore: true,
      continuesAfter: true,
    });
  });

  it('shows "+N" for days with more all-day events than lanes', () => {
    const events = ['a', 'b', 'c', 'd', 'e'].map((id) =>
      makeAllDayEvent({ id, title: id, start: '2026-10-13', end: '2026-10-14' }),
    );
    const m = buildTimeGridModel(input({ events }));
    expect(m.allDay.hidden).toEqual([0, 3, 0, 0, 0, 0, 0]);
    expect(m.allDay.bars).toHaveLength(2);
  });

  it('works for a single day', () => {
    const e = makeAllDayEvent();
    const m = buildTimeGridModel(input({ days: ['2026-10-13'], events: [e] }));
    expect(m.days).toHaveLength(1);
    expect(m.allDay.bars).toHaveLength(1);
    expect(m.allDay.hidden).toEqual([0]);
  });
});

describe('buildTimeGridModel: robustness', () => {
  it('returns an empty model for no days', () => {
    const m = buildTimeGridModel(input({ days: [], events: [makeEvent()] }));
    expect(m.days).toEqual([]);
    expect(m.allDay).toEqual({ bars: [], hidden: [] });
  });

  it('skips and counts damaged records, hides hidden calendars silently', () => {
    const m = buildTimeGridModel(
      input({
        calendars: [makeCalendar(), makeCalendar({ id: 'cal-2', visible: false })],
        events: [
          makeEvent(),
          { id: 'broken', title: 7 },
          makeEvent({ id: 'in-hidden', calendarId: 'cal-2' }),
        ],
      }),
    );
    expect(m.skipped).toBe(1);
    expect(m.days.flatMap((d) => d.blocks)).toHaveLength(1);
  });

  it('reports an unsupported rule and still shows the event once', () => {
    const m = buildTimeGridModel(input({ events: [makeEvent({ rrule: 'FREQ=HOURLY' })] }));
    expect(m.problems).toHaveLength(1);
    expect(m.days.flatMap((d) => d.blocks)).toHaveLength(1);
  });
});
