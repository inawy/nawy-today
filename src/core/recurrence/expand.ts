import type { IsoWeekday, PlainDate } from '@/core/time';
import {
  daysInMonthOf,
  epochDayOf,
  fromEpochDay,
  isoDateOfEpochDay,
  isoWeekdayOfEpochDay,
  toEpochDay,
} from '@/core/time';
import type { Rule } from './rule';

// Expands a rule into wall-clock occurrences (D-021). Works on epoch-day integers, so reaching a
// window far from DTSTART is O(1) when the rule has no COUNT. Time zones and DST are NOT handled
// here: occurrences are local wall-clock values, resolved to instants later by core/time (D-005).
//
// Semantics (same as python-dateutil, the reference of the golden fixtures):
//  - DTSTART is an occurrence only if it matches the rule; occurrences earlier than DTSTART never exist.
//  - Days that do not exist (31 April, 29 February in a common year) are skipped, not moved.
//  - BYMONTHDAY and BYDAY together intersect.

const MAX_YEAR = 9999;
const MAX_PERIODS = 2_000_000;
export const DEFAULT_LIMIT = 1000;

export interface ExpandOptions {
  /** Maximum number of occurrences returned (the earliest ones in the window). */
  readonly limit?: number;
}

/** `YYYY-MM-DD` bounds are read as the start of that day. */
const normalize = (s: string): string => (s.length === 10 ? `${s}T00:00` : s.slice(0, 16));

const floorDiv = (a: number, b: number): number => Math.floor(a / b);

/**
 * Occurrences `o` of `rule` (anchored at `dtstart`) with `from <= o < to`, ascending, in the
 * same format as `dtstart` (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`). Throws RangeError on a
 * malformed `dtstart`.
 */
export function expandRule(
  rule: Rule,
  dtstart: PlainDate | string,
  from: string,
  to: string,
  options: ExpandOptions = {},
): string[] {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const startDay = epochDayOf(dtstart.slice(0, 10));
  if (
    startDay === undefined ||
    (dtstart.length !== 10 && !/^T\d{2}:\d{2}$/.test(dtstart.slice(10)))
  ) {
    throw new RangeError(`Invalid DTSTART: "${dtstart}"`);
  }
  const timeSuffix = dtstart.slice(10);
  const fromN = normalize(from);
  const toN = normalize(to);
  const untilN =
    rule.until === undefined
      ? undefined
      : `${rule.until.slice(0, 10)}T${rule.until.length > 10 ? rule.until.slice(11, 16) : '23:59'}`;
  const fromDay = epochDayOf(fromN.slice(0, 10));
  const toDay = epochDayOf(toN.slice(0, 10));
  if (fromDay === undefined || toDay === undefined) throw new RangeError('Invalid window');

  const start = fromEpochDay(startDay);
  const startMonthIndex = start.year * 12 + (start.month - 1);
  const { freq, interval } = rule;
  const weekStart0 = startDay - ((isoWeekdayOfEpochDay(startDay) - rule.wkst + 7) % 7);

  // ---- candidate days of one period, ascending ----
  const hasMonthDay = rule.byMonthDay.length > 0;
  const hasDay = rule.byDay.length > 0;

  const monthDays = (year: number, month: number): number[] => {
    const dim = daysInMonthOf(year, month);
    if (!hasMonthDay && !hasDay)
      return start.day <= dim ? [toEpochDay(year, month, start.day)] : [];
    const first = toEpochDay(year, month, 1);
    const firstWd = isoWeekdayOfEpochDay(first);
    const mdSet = hasMonthDay
      ? new Set(rule.byMonthDay.map((n) => (n > 0 ? n : dim + 1 + n)))
      : undefined;
    let wdSet: Set<number> | undefined;
    if (hasDay) {
      wdSet = new Set();
      for (const b of rule.byDay) {
        // first day-of-month that falls on this weekday
        const firstHit = 1 + ((b.day - firstWd + 7) % 7);
        if (b.nth === undefined) {
          for (let d = firstHit; d <= dim; d += 7) wdSet.add(d);
        } else if (b.nth > 0) {
          const d = firstHit + (b.nth - 1) * 7;
          if (d <= dim) wdSet.add(d);
        } else {
          const hits = Math.floor((dim - firstHit) / 7) + 1;
          const d = firstHit + (hits + b.nth) * 7;
          if (hits + b.nth >= 0 && d >= 1) wdSet.add(d);
        }
      }
    }
    const out: number[] = [];
    for (let d = 1; d <= dim; d += 1) {
      if (mdSet && !mdSet.has(d)) continue;
      if (wdSet && !wdSet.has(d)) continue;
      out.push(toEpochDay(year, month, d));
    }
    return out;
  };

  const monthAllowed = (m: number): boolean =>
    rule.byMonth.length === 0 || rule.byMonth.includes(m);

  /** [first day of the period, candidate days]. */
  const period = (k: number): [number, number[]] => {
    switch (freq) {
      case 'DAILY': {
        const day = startDay + k * interval;
        const c = fromEpochDay(day);
        if (!monthAllowed(c.month)) return [day, []];
        if (hasMonthDay) {
          const dim = daysInMonthOf(c.year, c.month);
          if (!rule.byMonthDay.some((n) => (n > 0 ? n : dim + 1 + n) === c.day)) return [day, []];
        }
        if (hasDay) {
          const wd = isoWeekdayOfEpochDay(day);
          if (!rule.byDay.some((b) => b.day === wd)) return [day, []];
        }
        return [day, [day]];
      }
      case 'WEEKLY': {
        const ws = weekStart0 + 7 * interval * k;
        const wds: IsoWeekday[] = hasDay
          ? [...new Set(rule.byDay.map((b) => b.day))]
          : [isoWeekdayOfEpochDay(startDay)];
        const days = wds
          .map((wd) => ws + ((wd - rule.wkst + 7) % 7))
          .sort((a, b) => a - b)
          .filter((d) => monthAllowed(fromEpochDay(d).month));
        return [ws, days];
      }
      case 'MONTHLY': {
        const idx = startMonthIndex + k * interval;
        const year = floorDiv(idx, 12);
        const month = idx - year * 12 + 1;
        return [toEpochDay(year, month, 1), monthAllowed(month) ? monthDays(year, month) : []];
      }
      case 'YEARLY': {
        const year = start.year + k * interval;
        const months = rule.byMonth.length
          ? rule.byMonth
          : hasMonthDay || hasDay
            ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
            : [start.month];
        return [toEpochDay(year, 1, 1), months.flatMap((m) => monthDays(year, m))];
      }
    }
  };

  // ---- first period worth looking at ----
  let k0 = 0;
  if (rule.count === undefined) {
    // Without COUNT nothing depends on earlier occurrences, so jump straight to the window.
    const f = fromEpochDay(fromDay);
    switch (freq) {
      case 'DAILY':
        k0 = floorDiv(fromDay - startDay, interval);
        break;
      case 'WEEKLY':
        k0 = floorDiv(fromDay - weekStart0, 7 * interval);
        break;
      case 'MONTHLY':
        k0 = floorDiv(f.year * 12 + (f.month - 1) - startMonthIndex, interval);
        break;
      case 'YEARLY':
        k0 = floorDiv(f.year - start.year, interval);
        break;
    }
    k0 = Math.max(0, k0 - 1);
  }

  const out: string[] = [];
  let emitted = 0;
  for (let k = k0; k - k0 <= MAX_PERIODS; k += 1) {
    const [periodStart, days] = period(k);
    if (periodStart > toDay || fromEpochDay(periodStart).year > MAX_YEAR) break;
    for (const day of days) {
      if (day < startDay) continue;
      const occurrence = `${isoDateOfEpochDay(day)}${timeSuffix}`;
      const n = normalize(occurrence);
      if (untilN !== undefined && n > untilN) return out;
      emitted += 1;
      if (rule.count !== undefined && emitted > rule.count) return out;
      if (n >= fromN && n < toN) {
        out.push(occurrence);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}
