import type { IsoWeekday, PlainDate } from './types';

// Pure integer calendar arithmetic (proleptic Gregorian) on "epoch days": whole days since
// 1970-01-01. No Date, no Temporal: this is what lets the recurrence engine jump straight to a
// window instead of walking from DTSTART (D-021). Algorithms: Howard Hinnant's civil-days.

export interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function daysInMonthOf(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return MONTH_LENGTHS[month - 1] ?? 0;
}

export function toEpochDay(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fromEpochDay(epochDay: number): CivilDate {
  const z = epochDay + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

/** ISO weekday (1 = Monday … 7 = Sunday) of an epoch day. 1970-01-01 was a Thursday. */
export function isoWeekdayOfEpochDay(epochDay: number): IsoWeekday {
  return (((((epochDay + 3) % 7) + 7) % 7) + 1) as IsoWeekday;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Epoch day of a `YYYY-MM-DD` string, or `undefined` if it is not a real calendar date. */
export function epochDayOf(date: PlainDate): number | undefined {
  const m = ISO_DATE.exec(date);
  if (!m) return undefined;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonthOf(year, month)) return undefined;
  return toEpochDay(year, month, day);
}

export function isoDateOfEpochDay(epochDay: number): PlainDate {
  const { year, month, day } = fromEpochDay(epochDay);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const ISO_DATE_TIME = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?$/;

/**
 * Minutes since 1970-01-01T00:00 of a wall-clock value (`YYYY-MM-DD` counts as 00:00), or
 * `undefined` if malformed. Purely civil: no zone, no DST — use it for wall-clock offsets only.
 */
export function toEpochMinute(value: string): number | undefined {
  const m = ISO_DATE_TIME.exec(value);
  if (!m) return undefined;
  const day = epochDayOf(m[1] ?? '');
  if (day === undefined) return undefined;
  const hour = m[2] === undefined ? 0 : Number(m[2]);
  const minute = m[3] === undefined ? 0 : Number(m[3]);
  if (hour > 23 || minute > 59) return undefined;
  return day * 1440 + hour * 60 + minute;
}

/** Inverse of `toEpochMinute`: a `YYYY-MM-DD` string when `dateOnly`, else `YYYY-MM-DDTHH:mm`. */
export function isoOfEpochMinute(epochMinute: number, dateOnly: boolean): string {
  const day = Math.floor(epochMinute / 1440);
  const date = isoDateOfEpochDay(day);
  if (dateOnly) return date;
  const rest = epochMinute - day * 1440;
  return `${date}T${String(Math.floor(rest / 60)).padStart(2, '0')}:${String(rest % 60).padStart(2, '0')}`;
}
