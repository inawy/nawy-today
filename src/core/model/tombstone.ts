import { defined } from './result';
import type { CalEvent, Calendar } from './types';

/**
 * The next `updatedAt` for a record: the current time, but always strictly greater than the
 * previous value. Two writes in the same millisecond (or a clock that stepped back) must still
 * order correctly, because `updatedAt` is the clock that decides merges (D-008).
 */
export function nextUpdatedAt(previous: number, now: number): number {
  return Math.max(now, previous + 1);
}

/** Deleting never removes a record; it replaces it with a tombstone that keeps no content. */
export function tombstoneCalendar(calendar: Calendar, now: number): Calendar {
  const t = nextUpdatedAt(calendar.updatedAt, now);
  return {
    id: calendar.id,
    name: '',
    color: calendar.color,
    visible: false,
    createdAt: calendar.createdAt,
    updatedAt: t,
    deletedAt: t,
  };
}

export function tombstoneEvent(event: CalEvent, now: number): CalEvent {
  const t = nextUpdatedAt(event.updatedAt, now);
  return defined({
    id: event.id,
    calendarId: event.calendarId,
    title: '',
    allDay: event.allDay,
    start: event.start,
    end: event.end,
    tzid: event.tzid,
    createdAt: event.createdAt,
    updatedAt: t,
    deletedAt: t,
  });
}
