import type { CalEvent, Calendar } from '@/core/model';

/** 2026-10-13 09:00 UTC. */
export const T0 = Date.UTC(2026, 9, 13, 9, 0);
export const DAY = 24 * 60 * 60 * 1000;

export function makeCalendar(over: Partial<Calendar> = {}): Calendar {
  return {
    id: 'cal-1',
    name: 'Personal',
    color: 'blue',
    visible: true,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

export function makeEvent(over: Partial<CalEvent> = {}): CalEvent {
  return {
    id: 'ev-1',
    calendarId: 'cal-1',
    title: 'Meeting',
    allDay: false,
    start: '2026-10-13T09:00',
    end: '2026-10-13T10:00',
    tzid: 'Asia/Riyadh',
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

export function makeAllDayEvent(over: Partial<CalEvent> = {}): CalEvent {
  return makeEvent({
    id: 'ev-allday',
    allDay: true,
    start: '2026-10-13',
    end: '2026-10-14',
    tzid: undefined,
    ...over,
  });
}

/** A controllable clock. */
export function fakeClock(start: number = T0) {
  let t = start;
  return {
    now: () => t,
    set: (value: number) => {
      t = value;
    },
    advance: (ms: number) => {
      t += ms;
      return t;
    },
  };
}

/** Deterministic ids: `${prefix}-1`, `${prefix}-2`, … */
export function counterIds(prefix = 'id'): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}
