import { dateParts } from './date';
import { minuteOfDay } from './datetime';
import type { PlainDate, PlainDateTime } from './types';

// Locale-aware formatting through the built-in Intl API — no library, no network (D-016).
// The Gregorian calendar is always requested explicitly: locales such as ar-SA default to the
// Hijri calendar, which must only ever appear as a deliberate secondary display.

export type Numerals = 'latn' | 'arab';

export interface FormatOptions {
  /** BCP 47 tag, e.g. `ar`, `en`. */
  locale: string;
  /** Digits: Latin (0-9) or Arabic-Indic (٠-٩). Default `latn`. */
  numerals?: Numerals;
}

export type TimeFormatOptions = FormatOptions & {
  /** 12-hour clock with AM/PM (ص/م) when true, 24-hour when false. */
  hour12: boolean;
};

const cache = new Map<string, Intl.DateTimeFormat>();

// Constructing Intl.DateTimeFormat is slow; a month grid formats ~42 cells per render.
function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    cache.set(key, f);
  }
  return f;
}

function utcMidnight(date: PlainDate): Date {
  const { year, month, day } = dateParts(date);
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day); // setUTCFullYear avoids the 0–99 → 1900s quirk
  return d;
}

function gregorian(o: FormatOptions): Intl.DateTimeFormatOptions {
  return { calendar: 'gregory', numberingSystem: o.numerals ?? 'latn', timeZone: 'UTC' };
}

/** e.g. "October 2026" / "أكتوبر 2026" */
export function formatMonthTitle(date: PlainDate, o: FormatOptions): string {
  const f = formatter(o.locale, { ...gregorian(o), month: 'long', year: 'numeric' });
  return f.format(utcMidnight(date));
}

export function formatWeekday(
  date: PlainDate,
  o: FormatOptions,
  width: 'long' | 'short' | 'narrow' = 'short',
): string {
  return formatter(o.locale, { ...gregorian(o), weekday: width }).format(utcMidnight(date));
}

/** The day of the month as a number, e.g. "13". */
export function formatDayOfMonth(date: PlainDate, o: FormatOptions): string {
  return formatter(o.locale, { ...gregorian(o), day: 'numeric' }).format(utcMidnight(date));
}

export function formatDate(
  date: PlainDate,
  o: FormatOptions,
  style: 'full' | 'long' | 'medium' | 'short' = 'long',
): string {
  return formatter(o.locale, { ...gregorian(o), dateStyle: style }).format(utcMidnight(date));
}

/**
 * Secondary Hijri display (Umm al-Qura). Display only — nothing Hijri is ever stored (D-016).
 * Uses the platform's calendar data; may differ by a day from local moon-sighting announcements.
 */
export function formatHijriDate(date: PlainDate, o: FormatOptions): string {
  const f = formatter(o.locale, {
    calendar: 'islamic-umalqura',
    numberingSystem: o.numerals ?? 'latn',
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return f.format(utcMidnight(date));
}

/** Time of day of a wall-clock value, e.g. "9:05 AM" / "09:05" / "9:05 ص". */
export function formatTime(value: PlainDateTime, o: TimeFormatOptions): string {
  const minutes = minuteOfDay(value);
  const at = new Date(Date.UTC(1970, 0, 1, Math.floor(minutes / 60), minutes % 60));
  const f = formatter(o.locale, {
    numberingSystem: o.numerals ?? 'latn',
    timeZone: 'UTC',
    hourCycle: o.hour12 ? 'h12' : 'h23',
    hour: o.hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
  });
  return f.format(at);
}
