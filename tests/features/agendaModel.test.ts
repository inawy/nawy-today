// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildAgendaModel } from '@/features/agenda';
import { makeAllDayEvent, makeCalendar, makeEvent } from '../helpers/factories';

const build = (events: unknown[], date = '2026-10-13', nowLocal = '2026-10-13T12:00') =>
  buildAgendaModel({ calendars: [makeCalendar()], events, date, nowLocal });
const titles = (m: ReturnType<typeof build>) => m.items.map((i) => i.occurrence.event.title);

describe('buildAgendaModel', () => {
  it('lists all-day first, then timed events by start', () => {
    const m = build([
      makeEvent({ id: 'b', title: 'Late', start: '2026-10-13T15:00', end: '2026-10-13T16:00' }),
      makeEvent({ id: 'a', title: 'Early', start: '2026-10-13T08:00', end: '2026-10-13T09:00' }),
      makeAllDayEvent({ id: 'c', title: 'Holiday', start: '2026-10-13', end: '2026-10-14' }),
    ]);
    expect(titles(m)).toEqual(['Holiday', 'Early', 'Late']);
  });

  it('marks ended / running / coming events and puts the marker after the ended ones', () => {
    const m = build([
      makeAllDayEvent({ id: 'c', title: 'Holiday', start: '2026-10-13', end: '2026-10-14' }),
      makeEvent({ id: 'a', title: 'Done', start: '2026-10-13T08:00', end: '2026-10-13T09:00' }),
      makeEvent({ id: 'b', title: 'Now', start: '2026-10-13T11:30', end: '2026-10-13T12:30' }),
      makeEvent({ id: 'd', title: 'Next', start: '2026-10-13T15:00', end: '2026-10-13T16:00' }),
    ]);
    expect(m.items.map((i) => i.status)).toEqual(['upcoming', 'past', 'now', 'upcoming']);
    expect(m.nowIndex).toBe(2); // after the all-day item and "Done"
  });

  it('an event ending exactly now has ended; one starting exactly now is running', () => {
    const m = build([
      makeEvent({ id: 'a', title: 'Ends', start: '2026-10-13T11:00', end: '2026-10-13T12:00' }),
      makeEvent({ id: 'b', title: 'Starts', start: '2026-10-13T12:00', end: '2026-10-13T13:00' }),
    ]);
    expect(m.items.map((i) => i.status)).toEqual(['past', 'now']);
  });

  it('all ended: the marker is last. nothing yet: the marker is first', () => {
    const ended = build([makeEvent({ start: '2026-10-13T08:00', end: '2026-10-13T09:00' })]);
    expect(ended.nowIndex).toBe(1);
    const coming = build([makeEvent({ start: '2026-10-13T18:00', end: '2026-10-13T19:00' })]);
    expect(coming.nowIndex).toBe(0);
  });

  it('other days have no marker: past days are all past, future days all upcoming', () => {
    const past = build([makeEvent({ start: '2026-10-12T20:00', end: '2026-10-12T21:00' })], '2026-10-12');
    expect(past.nowIndex).toBeNull();
    expect(past.items.map((i) => i.status)).toEqual(['past']);
    const future = build([makeEvent({ start: '2026-10-14T01:00', end: '2026-10-14T02:00' })], '2026-10-14');
    expect(future.items.map((i) => i.status)).toEqual(['upcoming']);
  });

  it('an event running past midnight shows on both days', () => {
    const e = makeEvent({ start: '2026-10-13T23:00', end: '2026-10-14T01:00' });
    expect(build([e], '2026-10-13').items).toHaveLength(1);
    const next = build([e], '2026-10-14');
    expect(next.items).toHaveLength(1);
    expect(next.items[0]?.startMin).toBe(0);
  });

  it('expands repeating events and applies exceptions', () => {
    const series = makeEvent({ rrule: 'FREQ=DAILY', exdates: ['2026-10-14T09:00'] });
    expect(build([series], '2026-10-13').items).toHaveLength(1);
    expect(build([series], '2026-10-14').items).toHaveLength(0);
  });

  it('skips damaged records and counts them; hidden calendars are left out', () => {
    const m = buildAgendaModel({
      calendars: [makeCalendar({ visible: false })],
      events: [makeEvent(), { nonsense: true }],
      date: '2026-10-13',
      nowLocal: '2026-10-13T12:00',
    });
    expect(m.items).toHaveLength(0);
    expect(m.skipped).toBe(1);
  });
});
