// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { expandEvents, expandRule, parseRule, splitSeries } from '@/core/recurrence';
import type { Rule } from '@/core/recurrence';
import { makeAllDayEvent, makeEvent } from '../../helpers/factories';

const rule = (text: string): Rule => {
  const r = parseRule(text);
  if (!r.ok) throw new Error(r.error);
  return r.rule;
};
const starts = (events: Parameters<typeof expandEvents>[0], from: string, to: string) =>
  expandEvents(events, from, to).occurrences.map((o) => o.start);

describe('expandEvents: single events', () => {
  it('includes events that overlap the window, with from inclusive and to exclusive', () => {
    const e = makeEvent({ start: '2026-10-13T09:00', end: '2026-10-13T10:00' });
    expect(starts([e], '2026-10-13', '2026-10-14')).toEqual(['2026-10-13T09:00']);
    expect(starts([e], '2026-10-13T10:00', '2026-10-14')).toEqual([]); // ends exactly at from
    expect(starts([e], '2026-10-12', '2026-10-13T09:00')).toEqual([]); // starts exactly at to
    expect(starts([e], '2026-10-13T09:59', '2026-10-14')).toEqual(['2026-10-13T09:00']);
  });

  it('keeps a multi-day all-day event visible on later days (exclusive end)', () => {
    const e = makeAllDayEvent({ start: '2026-10-13', end: '2026-10-16' });
    expect(starts([e], '2026-10-15', '2026-10-16')).toEqual(['2026-10-13']);
    expect(starts([e], '2026-10-16', '2026-10-17')).toEqual([]);
  });

  it('shows a zero-length event only when its instant is inside', () => {
    const e = makeEvent({ start: '2026-10-13T09:00', end: '2026-10-13T09:00' });
    expect(starts([e], '2026-10-13T09:00', '2026-10-13T09:01')).toEqual(['2026-10-13T09:00']);
    expect(starts([e], '2026-10-13T09:01', '2026-10-14')).toEqual([]);
  });

  it('skips tombstones', () => {
    const e = makeEvent({ deletedAt: 5 });
    expect(starts([e], '2026-10-01', '2026-11-01')).toEqual([]);
  });

  it('sorts by start, then end, then key', () => {
    const a = makeEvent({ id: 'b', start: '2026-10-13T09:00', end: '2026-10-13T10:00' });
    const b = makeEvent({ id: 'a', start: '2026-10-13T09:00', end: '2026-10-13T09:30' });
    const c = makeAllDayEvent({ id: 'c', start: '2026-10-13', end: '2026-10-14' });
    expect(
      expandEvents([a, b, c], '2026-10-13', '2026-10-14').occurrences.map((o) => o.key),
    ).toEqual(['c', 'a', 'b']);
  });
});

describe('expandEvents: repeating events', () => {
  const weekly = makeEvent({
    id: 'w',
    start: '2026-10-05T18:00',
    end: '2026-10-05T19:30',
    rrule: 'FREQ=WEEKLY;BYDAY=MO',
  });

  it('expands with the master duration on every occurrence', () => {
    const { occurrences } = expandEvents([weekly], '2026-10-01', '2026-10-20');
    expect(occurrences.map((o) => [o.start, o.end])).toEqual([
      ['2026-10-05T18:00', '2026-10-05T19:30'],
      ['2026-10-12T18:00', '2026-10-12T19:30'],
      ['2026-10-19T18:00', '2026-10-19T19:30'],
    ]);
    expect(occurrences.every((o) => o.recurring && !o.override)).toBe(true);
  });

  it('shows an occurrence that began before the window but is still running', () => {
    const night = makeEvent({
      id: 'n',
      start: '2026-10-05T22:00',
      end: '2026-10-06T02:00',
      rrule: 'FREQ=DAILY',
    });
    expect(starts([night], '2026-10-07T00:30', '2026-10-07T01:00')).toEqual(['2026-10-06T22:00']);
  });

  it('keeps multi-day all-day durations', () => {
    const trip = makeAllDayEvent({
      id: 't',
      start: '2026-10-05',
      end: '2026-10-08',
      rrule: 'FREQ=MONTHLY',
    });
    const { occurrences } = expandEvents([trip], '2026-11-01', '2026-12-01');
    expect(occurrences.map((o) => [o.start, o.end])).toEqual([['2026-11-05', '2026-11-08']]);
  });

  it('removes EXDATE occurrences', () => {
    const e = { ...weekly, exdates: ['2026-10-12T18:00'] };
    expect(starts([e], '2026-10-01', '2026-10-20')).toEqual([
      '2026-10-05T18:00',
      '2026-10-19T18:00',
    ]);
  });

  it('replaces one occurrence with its override (edited title keeps the slot)', () => {
    const o = makeEvent({
      id: 'o1',
      title: 'Changed',
      seriesId: 'w',
      originalStart: '2026-10-12T18:00',
      start: '2026-10-12T18:00',
      end: '2026-10-12T19:30',
    });
    const { occurrences } = expandEvents([weekly, o], '2026-10-01', '2026-10-20');
    expect(occurrences.map((x) => [x.start, x.event.title, x.override])).toEqual([
      ['2026-10-05T18:00', 'Meeting', false],
      ['2026-10-12T18:00', 'Changed', true],
      ['2026-10-19T18:00', 'Meeting', false],
    ]);
    expect(occurrences[1]?.originalStart).toBe('2026-10-12T18:00');
  });

  it('shows a moved override at its new time and not at the old one', () => {
    const o = makeEvent({
      id: 'o1',
      seriesId: 'w',
      originalStart: '2026-10-12T18:00',
      start: '2026-10-14T08:00',
      end: '2026-10-14T09:00',
    });
    expect(starts([weekly, o], '2026-10-01', '2026-10-20')).toEqual([
      '2026-10-05T18:00',
      '2026-10-14T08:00',
      '2026-10-19T18:00',
    ]);
  });

  it('shows an override moved INTO the window although its original slot is outside', () => {
    const o = makeEvent({
      id: 'o1',
      seriesId: 'w',
      originalStart: '2026-10-05T18:00',
      start: '2026-11-03T08:00',
      end: '2026-11-03T09:00',
    });
    expect(starts([weekly, o], '2026-11-01', '2026-11-08')).toEqual([
      '2026-11-02T18:00',
      '2026-11-03T08:00',
    ]);
  });

  it('hides an override moved OUT of the window', () => {
    const o = makeEvent({
      id: 'o1',
      seriesId: 'w',
      originalStart: '2026-10-12T18:00',
      start: '2026-12-01T08:00',
      end: '2026-12-01T09:00',
    });
    expect(starts([weekly, o], '2026-10-10', '2026-10-15')).toEqual([]);
  });

  it('a deleted override stops overriding: the series occurrence comes back', () => {
    const o = makeEvent({
      id: 'o1',
      seriesId: 'w',
      originalStart: '2026-10-12T18:00',
      start: '2026-10-12T18:00',
      end: '2026-10-12T19:30',
      deletedAt: 9,
    });
    expect(starts([weekly, o], '2026-10-10', '2026-10-15')).toEqual(['2026-10-12T18:00']);
  });

  it('an EXDATE wins over an override of the same slot', () => {
    const o = makeEvent({
      id: 'o1',
      seriesId: 'w',
      originalStart: '2026-10-12T18:00',
      start: '2026-10-12T18:00',
      end: '2026-10-12T19:30',
    });
    const e = { ...weekly, exdates: ['2026-10-12T18:00'] };
    expect(starts([e, o], '2026-10-10', '2026-10-15')).toEqual([]);
  });

  it('reports an override whose series is gone, and does not show it', () => {
    const o = makeEvent({ id: 'o1', seriesId: 'missing', originalStart: '2026-10-12T18:00' });
    const r = expandEvents([o], '2026-10-01', '2026-11-01');
    expect(r.occurrences).toEqual([]);
    expect(r.problems).toEqual([{ kind: 'orphan-override', eventId: 'o1' }]);
  });

  it('reports a broken rule and still shows the event once', () => {
    const e = makeEvent({ id: 'x', rrule: 'FREQ=HOURLY' });
    const r = expandEvents([e], '2026-10-01', '2026-11-01');
    expect(r.occurrences).toHaveLength(1);
    expect(r.problems[0]).toMatchObject({ kind: 'invalid-rrule', eventId: 'x' });
  });

  it('reports truncation instead of silently dropping occurrences', () => {
    const e = makeEvent({ id: 'd', rrule: 'FREQ=DAILY' });
    const r = expandEvents([e], '2026-10-13', '2030-01-01', { limitPerSeries: 10 });
    expect(r.occurrences).toHaveLength(10);
    expect(r.problems).toEqual([{ kind: 'truncated', eventId: 'd' }]);
  });
});

describe('splitSeries ("this and following")', () => {
  const master = makeEvent({
    id: 'm',
    start: '2026-10-05T18:00',
    end: '2026-10-05T19:00',
    rrule: 'FREQ=WEEKLY;BYDAY=MO',
  });

  const plan = (m: typeof master, at: string, overrides: (typeof master)[] = []) => {
    const r = splitSeries(m, at, overrides);
    if (!r.ok) throw new Error(r.error);
    return r.plan;
  };

  it('ends the head the day before and starts the tail at the split occurrence', () => {
    const p = plan(master, '2026-10-19T18:00');
    expect(p.headRule).toBe('FREQ=WEEKLY;BYDAY=MO;UNTIL=20261018T235900');
    expect(p.tailRule).toBe('FREQ=WEEKLY;BYDAY=MO');
  });

  it('uses a date UNTIL for all-day events', () => {
    const m = makeAllDayEvent({
      id: 'a',
      start: '2026-10-05',
      end: '2026-10-06',
      rrule: 'FREQ=DAILY',
    });
    expect(plan(m, '2026-10-09').headRule).toBe('FREQ=DAILY;UNTIL=20261008');
  });

  it('splitting at the first occurrence leaves no head', () => {
    const p = plan(master, '2026-10-05T18:00');
    expect(p.headRule).toBeNull();
    expect(p.tailRule).toBe('FREQ=WEEKLY;BYDAY=MO');
  });

  it('divides COUNT between the two parts', () => {
    const m = { ...master, rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=6' };
    const p = plan(m, '2026-10-19T18:00');
    expect(p.headRule).toBe('FREQ=WEEKLY;BYDAY=MO;COUNT=2');
    expect(p.tailRule).toBe('FREQ=WEEKLY;BYDAY=MO;COUNT=4');
  });

  it('keeps an original UNTIL on the tail', () => {
    const m = { ...master, rrule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261130T235900' };
    expect(plan(m, '2026-10-19T18:00').tailRule).toBe('FREQ=WEEKLY;BYDAY=MO;UNTIL=20261130T235900');
  });

  it('shares exdates and moves later overrides to the tail', () => {
    const early = makeEvent({ id: 'o-early', seriesId: 'm', originalStart: '2026-10-12T18:00' });
    const late = makeEvent({ id: 'o-late', seriesId: 'm', originalStart: '2026-10-26T18:00' });
    const m = { ...master, exdates: ['2026-10-12T18:00', '2026-11-02T18:00'] };
    const p = plan(m, '2026-10-19T18:00', [early, late]);
    expect(p.headExdates).toEqual(['2026-10-12T18:00']);
    expect(p.tailExdates).toEqual(['2026-11-02T18:00']);
    expect(p.movedOverrideIds).toEqual(['o-late']);
  });

  it('refuses a split point that is not an occurrence, or a non-repeating event', () => {
    expect(splitSeries(master, '2026-10-20T18:00')).toMatchObject({ ok: false });
    expect(splitSeries(master, '2026-10-19')).toMatchObject({ ok: false });
    expect(splitSeries(makeEvent(), '2026-10-13T09:00')).toMatchObject({ ok: false });
  });

  it('head + tail reproduce the original series for many rules and split points', () => {
    const rules = [
      'FREQ=DAILY;INTERVAL=3',
      'FREQ=DAILY;COUNT=20',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO,TH;WKST=SU',
      'FREQ=WEEKLY;BYDAY=TU,FR;COUNT=15',
      'FREQ=MONTHLY',
      'FREQ=MONTHLY;INTERVAL=2;BYDAY=-1FR',
      'FREQ=MONTHLY;BYMONTHDAY=29,30,31;COUNT=9',
      'FREQ=YEARLY;INTERVAL=2',
      'FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
      'FREQ=WEEKLY;BYDAY=MO;UNTIL=20270601T235900',
    ];
    const window: [string, string] = ['2020-01-01', '2032-01-01'];
    for (const text of rules) {
      for (const [allDay, start] of [
        [false, '2026-01-31T09:00'],
        [true, '2026-03-02'],
        [false, '2024-02-29T23:30'],
      ] as const) {
        const m = allDay
          ? makeAllDayEvent({ id: 'm', start, end: '2026-03-03', rrule: text })
          : makeEvent({ id: 'm', start, end: start.replace(/T.*/, 'T23:59'), rrule: text });
        const all = expandRule(rule(text), start, window[0], window[1], { limit: 5000 });
        for (const at of all.slice(0, 12)) {
          const r = splitSeries(m, at);
          expect(r.ok).toBe(true);
          if (!r.ok) continue;
          const head =
            r.plan.headRule === null
              ? []
              : expandRule(rule(r.plan.headRule), start, window[0], window[1], { limit: 5000 });
          const tail = expandRule(rule(r.plan.tailRule), at, window[0], window[1], { limit: 5000 });
          expect([...head, ...tail], `${text} @ ${start} split ${at}`).toEqual(all);
        }
      }
    }
  });
});
