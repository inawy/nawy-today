import { Temporal } from 'temporal-polyfill';
import { daysInMonthOf } from './civil';
import type { IsoWeekday, PlainDate } from './types';

// All functions here take and return plain `YYYY-MM-DD` strings. Temporal never leaks out of
// core/time (enforced by lint), so the underlying library can be swapped (D-006).
// Invalid input throws RangeError — use isValidDate() to check untrusted input first.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parse(date: PlainDate): Temporal.PlainDate {
  if (!DATE_RE.test(date)) throw new RangeError(`Invalid date: "${date}"`);
  return Temporal.PlainDate.from(date, { overflow: 'reject' });
}

/**
 * `YYYY-MM-DD` that is a real calendar day. Plain integer checks: every stored event is checked
 * on every render, and going through Temporal for each one was the main cost of opening a
 * month with thousands of events (PRODUCT_SPEC section 5 budget).
 */
export function isValidDate(value: string): value is PlainDate {
  return DATE_RE.test(value) && isRealDay(value);
}

/** Assumes the `YYYY-MM-DD` shape; checks month and day ranges (proleptic Gregorian). */
export function isRealDay(value: string): boolean {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonthOf(year, month);
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
  const c = Temporal.PlainDate.compare(parse(a), parse(b));
  return c < 0 ? -1 : c > 0 ? 1 : 0;
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
