import { Temporal } from 'temporal-polyfill';
import type { PlainDate, PlainDateTime, TimeZoneId } from './types';

// Wall-clock arithmetic with explicit time zones. Event times are stored as local wall-clock
// time + tzid (D-005); instants are only computed at the edges, here.
//
// DST policy ("compatible", the same as Google Calendar and iCalendar):
//   • a wall-clock time that does not exist (spring-forward gap) moves forward by the gap;
//   • an ambiguous time (fall-back overlap) resolves to the earlier occurrence.

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const MINUTE = { smallestUnit: 'minute' } as const;

function parse(value: PlainDateTime): Temporal.PlainDateTime {
  if (!DATETIME_RE.test(value)) throw new RangeError(`Invalid date-time: "${value}"`);
  return Temporal.PlainDateTime.from(value, { overflow: 'reject' });
}

export function isValidDateTime(value: string): value is PlainDateTime {
  try {
    parse(value);
    return true;
  } catch {
    return false;
  }
}

export function isValidTimeZone(value: string): boolean {
  if (value === '') return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The device's current IANA time zone. */
export function localTimeZone(): TimeZoneId {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function datePart(value: PlainDateTime): PlainDate {
  return parse(value).toPlainDate().toString();
}

/** `HH:mm` */
export function timePart(value: PlainDateTime): string {
  return parse(value).toPlainTime().toString(MINUTE);
}

/** Joins a date and an `HH:mm` time. */
export function combine(date: PlainDate, time: string): PlainDateTime {
  return parse(`${date}T${time}`).toString(MINUTE);
}

/** Minutes since local midnight, 0–1439. */
export function minuteOfDay(value: PlainDateTime): number {
  const t = parse(value);
  return t.hour * 60 + t.minute;
}

/** The instant (epoch milliseconds) at which this wall-clock time occurs in `timeZone`. */
export function toInstantMs(value: PlainDateTime, timeZone: TimeZoneId): number {
  return parse(value).toZonedDateTime(timeZone, { disambiguation: 'compatible' })
    .epochMilliseconds;
}

/** The wall-clock time in `timeZone` at the given instant. */
export function fromInstantMs(epochMs: number, timeZone: TimeZoneId): PlainDateTime {
  return Temporal.Instant.fromEpochMilliseconds(epochMs)
    .toZonedDateTimeISO(timeZone)
    .toPlainDateTime()
    .toString(MINUTE);
}

/** Real elapsed minutes between two wall-clock times — DST-aware (a day can be 23 or 25 hours). */
export function minutesBetween(
  start: PlainDateTime,
  end: PlainDateTime,
  timeZone: TimeZoneId,
): number {
  return Math.round((toInstantMs(end, timeZone) - toInstantMs(start, timeZone)) / 60_000);
}

/** Adds real elapsed minutes (not wall-clock minutes), DST-aware. */
export function addMinutes(
  value: PlainDateTime,
  minutes: number,
  timeZone: TimeZoneId,
): PlainDateTime {
  return fromInstantMs(toInstantMs(value, timeZone) + minutes * 60_000, timeZone);
}

/**
 * The current wall-clock time in `timeZone`. `nowMs` is injectable so callers and tests never
 * depend on the real clock.
 */
export function nowLocal(timeZone: TimeZoneId, nowMs: number = Date.now()): PlainDateTime {
  return fromInstantMs(nowMs, timeZone);
}

export function todayIn(timeZone: TimeZoneId, nowMs: number = Date.now()): PlainDate {
  return datePart(nowLocal(timeZone, nowMs));
}
