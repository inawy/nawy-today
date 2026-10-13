import { Temporal } from 'temporal-polyfill';
import type { IsoWeekday, PlainDate } from './types';

// All functions here take and return plain `YYYY-MM-DD` strings. Temporal never leaks out of
// core/time (enforced by lint), so the underlying library can be swapped (D-006).
// Invalid input throws RangeError — use isValidDate() to check untrusted input first.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parse(date: PlainDate): Temporal.PlainDate {
  if (!DATE_RE.test(date)) throw new RangeError(`Invalid date: "${date}"`);
  return Temporal.PlainDate.from(date, { overflow: 'reject' });
}

export function isValidDate(value: string): value is PlainDate {
  try {
    parse(value);
    return true;
  } catch {
    return false;
  }
}

export function dateParts(date: PlainDate): { year: number; month: number; day: number } {
  const d = parse(date);
  return { year: d.year, month: d.month, day: d.day };
}

export function addDays(date: PlainDate, days: number): PlainDate {
  return parse(date).add({ days }).toString();
}

/** Adds months, clamping the day to the target month's length (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: PlainDate, months: number): PlainDate {
  return parse(date).add({ months }).toString();
}

export function addYears(date: PlainDate, years: number): PlainDate {
  return parse(date).add({ years }).toString();
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function diffDays(from: PlainDate, to: PlainDate): number {
  return parse(from).until(parse(to), { largestUnit: 'day' }).days;
}

export function compareDates(a: PlainDate, b: PlainDate): -1 | 0 | 1 {
  return Temporal.PlainDate.compare(parse(a), parse(b));
}

export function weekdayOf(date: PlainDate): IsoWeekday {
  return parse(date).dayOfWeek as IsoWeekday;
}

/** The first day of the week containing `date`, for the given week start (ISO weekday). */
export function startOfWeek(date: PlainDate, weekStart: IsoWeekday): PlainDate {
  const offset = (weekdayOf(date) - weekStart + 7) % 7;
  return addDays(date, -offset);
}

/** The seven days of the week containing `date`. */
export function weekDays(date: PlainDate, weekStart: IsoWeekday): PlainDate[] {
  const start = startOfWeek(date, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function startOfMonth(date: PlainDate): PlainDate {
  return parse(date).with({ day: 1 }).toString();
}

export function endOfMonth(date: PlainDate): PlainDate {
  const d = parse(date);
  return d.with({ day: d.daysInMonth }).toString();
}

export function daysInMonth(date: PlainDate): number {
  return parse(date).daysInMonth;
}

/** First day of a month. `month` is 1–12; anything else throws RangeError. */
export function firstOfMonth(year: number, month: number): PlainDate {
  return Temporal.PlainDate.from({ year, month, day: 1 }, { overflow: 'reject' }).toString();
}

/**
 * The 6 × 7 grid for a month view. Always six weeks, so the layout never jumps between months.
 * Includes the trailing days of the previous month and the leading days of the next.
 */
export function monthGrid(year: number, month: number, weekStart: IsoWeekday): PlainDate[][] {
  const start = startOfWeek(firstOfMonth(year, month), weekStart);
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(start, week * 7 + day)),
  );
}
