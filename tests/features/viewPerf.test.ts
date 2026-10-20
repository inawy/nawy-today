import { describe, expect, it } from 'vitest';
import { buildAgendaModel } from '@/features/agenda';
import { buildMonthModel } from '@/features/month';
import { buildTimeGridModel } from '@/features/timegrid';
import { addDays } from '@/core/time';
import { makeCalendar, makeEvent } from '../helpers/factories';

// PRODUCT_SPEC section 5: "5000 events, opening the month <= 300 ms for the first paint".
// This gate covers the part that is pure computation (the model every view is drawn from); the
// real first paint is measured in the browser (e2e/release.spec.ts).

const calendar = makeCalendar({ id: 'cal-1' });
const events = Array.from({ length: 5000 }, (_, i) => {
  // Crowd October 2026 on purpose: ~1700 events land in the month being opened.
  const date = addDays('2026-09-20', i % 60);
  const hour = String(8 + (i % 10)).padStart(2, '0');
  return makeEvent({
    id: `e${i}`,
    title: `Event ${i}`,
    start: `${date}T${hour}:00`,
    end: `${date}T${hour}:45`,
    ...(i % 40 === 0 && { rrule: 'FREQ=WEEKLY;COUNT=20' }),
    ...(i % 17 === 0 && { allDay: true, start: date, end: addDays(date, 1) }),
  });
});

const time = <T>(work: () => T): { value: T; ms: number } => {
  const t0 = performance.now();
  const value = work();
  return { value, ms: performance.now() - t0 };
};

describe('performance gate: 5000 events', () => {
  it('builds the month model within 300 ms', () => {
    const { value, ms } = time(() =>
      buildMonthModel({
        calendars: [calendar],
        events,
        year: 2026,
        month: 10,
        weekStart: 6,
        maxLanes: 3,
      }),
    );
    expect(value.skipped).toBe(0);
    expect(ms).toBeLessThan(300);
  });

  it('builds the week and agenda models within 300 ms', () => {
    const week = time(() =>
      buildTimeGridModel({
        calendars: [calendar],
        events,
        days: Array.from({ length: 7 }, (_, i) => addDays('2026-10-17', i)),
        maxAllDayLanes: 3,
      }),
    );
    expect(week.ms).toBeLessThan(300);
    const agenda = time(() =>
      buildAgendaModel({
        calendars: [calendar],
        events,
        date: '2026-10-20',
        nowLocal: '2026-10-20T12:00',
      }),
    );
    expect(agenda.ms).toBeLessThan(300);
  });
});
