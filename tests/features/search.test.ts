// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildSearchIndex, searchEvents } from '@/features/search';
import { makeCalendar, makeEvent } from '../helpers/factories';

const TODAY = '2026-10-13';
const cal = makeCalendar();
const find = (events: unknown[], q: string, limit?: number) =>
  searchEvents(buildSearchIndex([cal], events), q, TODAY, limit).map(
    (r) => r.occurrence.event.title,
  );

describe('searchEvents', () => {
  it('matches title, location and notes; every word must be present', () => {
    const events = [
      makeEvent({ id: 'a', title: 'Dentist' }),
      makeEvent({ id: 'b', title: 'Lunch', location: 'Dentist office' }),
      makeEvent({ id: 'c', title: 'Call', notes: 'ask about the dentist bill' }),
      makeEvent({ id: 'd', title: 'Gym' }),
    ];
    expect(find(events, 'dentist').sort()).toEqual(['Call', 'Dentist', 'Lunch']);
    expect(find(events, 'dentist office')).toEqual(['Lunch']);
    expect(find(events, 'dentist gym')).toEqual([]);
  });

  it('finds Arabic text however it was written', () => {
    const events = [
      makeEvent({ id: 'a', title: 'اجتماع المدرسة' }),
      makeEvent({ id: 'b', title: 'مسؤول' }),
    ];
    expect(find(events, 'المدرسه')).toEqual(['اجتماع المدرسة']);
    expect(find(events, 'مَدرسَة')).toEqual(['اجتماع المدرسة']);
    expect(find(events, 'مسئول')).toEqual(['مسؤول']);
  });

  it('an empty or blank query finds nothing', () => {
    const events = [makeEvent()];
    expect(find(events, '')).toEqual([]);
    expect(find(events, '   ')).toEqual([]);
  });

  it('orders by closeness to today, the later one first on a tie', () => {
    const at = (id: string, day: string) =>
      makeEvent({ id, title: `T ${id}`, start: `${day}T09:00`, end: `${day}T10:00` });
    const events = [
      at('far-past', '2026-01-01'),
      at('tomorrow', '2026-10-14'),
      at('yesterday', '2026-10-12'),
      at('today', '2026-10-13'),
      at('far-future', '2027-06-01'),
    ];
    expect(find(events, 't')).toEqual([
      'T today',
      'T tomorrow',
      'T yesterday',
      'T far-future',
      'T far-past',
    ]);
  });

  it('a repeating event appears once, at its next occurrence', () => {
    const series = makeEvent({ id: 's', title: 'Standup', rrule: 'FREQ=DAILY' });
    const r = searchEvents(buildSearchIndex([cal], [series]), 'standup', '2026-11-20');
    expect(r).toHaveLength(1);
    expect(r[0]?.occurrence.start).toBe('2026-11-20T09:00');
    expect(r[0]?.occurrence.originalStart).toBe('2026-11-20T09:00');
    expect(r[0]?.occurrence.recurring).toBe(true);
  });

  it('a series that has ended is shown at its last occurrence', () => {
    const series = makeEvent({ id: 's', title: 'Course', rrule: 'FREQ=DAILY;COUNT=3' });
    const r = searchEvents(buildSearchIndex([cal], [series]), 'course', '2027-05-01');
    expect(r[0]?.occurrence.start).toBe('2026-10-15T09:00');
  });

  it('an override is listed only when its text differs from its series', () => {
    const series = makeEvent({ id: 's', title: 'Standup', rrule: 'FREQ=DAILY' });
    const same = makeEvent({
      id: 'o1',
      title: 'Standup',
      seriesId: 's',
      originalStart: '2026-10-14T09:00',
      start: '2026-10-14T11:00',
      end: '2026-10-14T12:00',
    });
    expect(find([series, same], 'standup')).toEqual(['Standup']);
    const renamed = makeEvent({
      id: 'o2',
      title: 'Standup with CEO',
      seriesId: 's',
      originalStart: '2026-10-15T09:00',
      start: '2026-10-15T09:00',
      end: '2026-10-15T09:30',
    });
    expect(find([series, same, renamed], 'ceo')).toEqual(['Standup with CEO']);
  });

  it('leaves out hidden calendars, deleted and damaged records', () => {
    const hidden = makeCalendar({ id: 'h', visible: false });
    const idx = buildSearchIndex(
      [cal, hidden],
      [
        makeEvent({ id: 'a', title: 'Keep' }),
        makeEvent({ id: 'b', title: 'Keep hidden', calendarId: 'h' }),
        { nonsense: true },
      ],
    );
    expect(idx.skipped).toBe(1);
    expect(searchEvents(idx, 'keep', TODAY).map((r) => r.occurrence.event.id)).toEqual(['a']);
  });

  it('respects the limit', () => {
    const events = Array.from({ length: 80 }, (_, i) =>
      makeEvent({ id: `e${i}`, title: `Item ${i}` }),
    );
    expect(find(events, 'item')).toHaveLength(50);
    expect(find(events, 'item', 5)).toHaveLength(5);
  });
});

describe('performance gate (PRODUCT_SPEC: search <= 200 ms on 5000 events)', () => {
  const words = ['اجتماع', 'مدرسة', 'Dentist', 'غداء', 'Review', 'مستشفى', 'Call', 'رياضة'];
  const events = Array.from({ length: 5000 }, (_, i) => {
    const day = String(1 + (i % 28)).padStart(2, '0');
    const month = String(1 + (i % 12)).padStart(2, '0');
    return makeEvent({
      id: `e${i}`,
      title: `${words[i % words.length]} ${i}`,
      location: i % 3 === 0 ? 'قاعة ١٢' : undefined,
      notes: i % 7 === 0 ? 'ملاحظات مهمة جدًا عن هذا الحدث' : undefined,
      start: `2026-${month}-${day}T09:00`,
      end: `2026-${month}-${day}T10:00`,
      ...(i % 50 === 0 && { rrule: 'FREQ=WEEKLY' }),
    });
  });

  it('builds the index and answers common queries well inside the budget', () => {
    const t0 = performance.now();
    const index = buildSearchIndex([cal], events);
    const built = performance.now() - t0;
    expect(index.entries).toHaveLength(5000);
    for (const q of ['مدرسه', 'dent', 'اجتماع ١٢', 'ملاحظات', 'zzz']) {
      const t1 = performance.now();
      searchEvents(index, q, TODAY);
      expect(performance.now() - t1, q).toBeLessThan(200);
    }
    expect(built).toBeLessThan(2000);
  });
});
