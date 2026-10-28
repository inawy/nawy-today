// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateRange,
  formatDayOfMonth,
  formatHijriDate,
  formatHijriDay,
  formatHijriSpan,
  formatMonthTitle,
  formatTime,
  formatWeekday,
  formatYear,
} from '@/core/time';

// Assertions avoid exact Arabic strings (ICU data differs slightly between versions) and check
// stable properties instead: which script, which digits, which year, which calendar.
const ARABIC_LETTERS = /[؀-ۿ]/;
const ARABIC_INDIC_DIGITS = /[٠-٩]/;
const LATIN_DIGITS = /[0-9]/;
const flat = (s: string) => s.replace(/[\s\u202f\u00a0]/g, ' ');

const AR = { locale: 'ar' };
const EN = { locale: 'en' };

describe('Gregorian formatting', () => {
  it('formats the month title', () => {
    expect(formatMonthTitle('2026-10-13', EN)).toBe('October 2026');
    const ar = formatMonthTitle('2026-10-13', AR);
    expect(ar).toMatch(ARABIC_LETTERS);
    expect(ar).toContain('2026');
  });

  it('names the weekday', () => {
    expect(formatWeekday('2026-10-13', EN, 'long')).toBe('Tuesday');
    expect(formatWeekday('2026-10-13', EN, 'short')).toBe('Tue');
    expect(formatWeekday('2026-10-13', AR, 'long')).toContain('الثلاثاء');
  });

  it('formats the day of the month', () => {
    expect(formatDayOfMonth('2026-10-13', EN)).toBe('13');
    expect(formatDayOfMonth('2026-10-03', EN)).toBe('3');
  });

  it('formats a full date', () => {
    expect(formatDate('2026-10-13', EN, 'long')).toBe('October 13, 2026');
  });

  it('stays Gregorian even for locales that default to Hijri (ar-SA)', () => {
    const title = formatMonthTitle('2026-10-13', { locale: 'ar-SA' });
    expect(title).toContain('2026');
    expect(title).not.toContain('1448');
  });

  it('works for dates before year 100 without the 1900s quirk', () => {
    expect(formatMonthTitle('0050-03-01', EN)).toContain('50');
  });
});

describe('numerals', () => {
  it('uses Latin digits by default, even for Arabic', () => {
    expect(formatDayOfMonth('2026-10-13', AR)).toMatch(LATIN_DIGITS);
    expect(formatDayOfMonth('2026-10-13', AR)).not.toMatch(ARABIC_INDIC_DIGITS);
  });

  it('uses Arabic-Indic digits on request', () => {
    const day = formatDayOfMonth('2026-10-13', { locale: 'ar', numerals: 'arab' });
    expect(day).toMatch(/^[٠-٩]+$/);
    expect(day).toBe('١٣'); // ١٣
  });
});

describe('Hijri (secondary display)', () => {
  it('shows the right Hijri year', () => {
    // 1 Muharram 1448 falls in mid-June 2026.
    expect(formatHijriDate('2026-10-13', AR)).toContain('1448');
    expect(formatHijriDate('2026-01-01', AR)).toContain('1447');
  });

  it('is Arabic text with Hijri month names', () => {
    expect(formatHijriDate('2026-10-13', AR)).toMatch(ARABIC_LETTERS);
  });

  it('honours Arabic-Indic digits', () => {
    expect(formatHijriDate('2026-10-13', { locale: 'ar', numerals: 'arab' })).toMatch(
      ARABIC_INDIC_DIGITS,
    );
  });
});

describe('time of day', () => {
  it('formats 12-hour time', () => {
    expect(flat(formatTime('2026-10-13T09:05', { ...EN, hour12: true }))).toBe('9:05 AM');
    expect(flat(formatTime('2026-10-13T15:30', { ...EN, hour12: true }))).toBe('3:30 PM');
    expect(flat(formatTime('2026-10-13T00:00', { ...EN, hour12: true }))).toBe('12:00 AM');
    expect(flat(formatTime('2026-10-13T12:00', { ...EN, hour12: true }))).toBe('12:00 PM');
  });

  it('formats 24-hour time, zero-padded, with midnight as 00', () => {
    expect(formatTime('2026-10-13T09:05', { ...EN, hour12: false })).toBe('09:05');
    expect(formatTime('2026-10-13T15:30', { ...EN, hour12: false })).toBe('15:30');
    expect(formatTime('2026-10-13T00:05', { ...EN, hour12: false })).toBe('00:05');
  });

  it('uses the Arabic day-period markers ص and م', () => {
    expect(formatTime('2026-10-13T09:05', { ...AR, hour12: true })).toContain('ص');
    expect(formatTime('2026-10-13T15:30', { ...AR, hour12: true })).toContain('م');
  });

  it('honours Arabic-Indic digits', () => {
    const t = formatTime('2026-10-13T09:05', { locale: 'ar', numerals: 'arab', hour12: false });
    expect(t).toMatch(ARABIC_INDIC_DIGITS);
    expect(t).not.toMatch(LATIN_DIGITS);
  });

  it('is stable when called repeatedly (formatter cache)', () => {
    const a = formatTime('2026-10-13T09:05', { ...EN, hour12: false });
    const b = formatTime('2026-10-13T09:05', { ...EN, hour12: false });
    expect(a).toBe(b);
  });
});

describe('formatDateRange', () => {
  it('does not repeat the month and year inside one month', () => {
    const text = flat(formatDateRange('2026-10-12', '2026-10-18', EN));
    expect(text).toMatch(/^Oct 12 ?[–-] ?18, 2026$/);
  });

  it('names both months across a month boundary, the year once', () => {
    const text = flat(formatDateRange('2026-10-28', '2026-11-03', EN));
    expect(text).toContain('Oct');
    expect(text).toContain('Nov');
    expect(text.match(/2026/g)).toHaveLength(1);
  });

  it('shows both years across a year boundary', () => {
    const text = flat(formatDateRange('2026-12-28', '2027-01-03', EN));
    expect(text).toContain('2026');
    expect(text).toContain('2027');
  });

  it('works in Arabic with the chosen digits, always Gregorian', () => {
    const latin = formatDateRange('2026-10-12', '2026-10-18', AR);
    expect(latin).toMatch(ARABIC_LETTERS);
    expect(latin).toMatch(LATIN_DIGITS);
    expect(latin).toContain('2026');
    const indic = formatDateRange('2026-10-12', '2026-10-18', { ...AR, numerals: 'arab' });
    expect(indic).toMatch(ARABIC_INDIC_DIGITS);
    expect(indic).not.toMatch(LATIN_DIGITS);
  });

  it('a single day is just that day', () => {
    expect(flat(formatDateRange('2026-10-12', '2026-10-12', EN))).toBe('Oct 12, 2026');
  });
});

describe('Hijri day and span', () => {
  it('gives the Hijri day number alone', () => {
    expect(formatHijriDay('2026-10-13', AR)).toMatch(/^\d+$/);
  });

  it('names one month and year when the days share them', () => {
    const one = formatHijriSpan('2026-10-13', '2026-10-13', AR);
    expect(one).toContain('1448');
    expect(one).not.toContain('–');
  });

  it('names both months when the days cross a boundary', () => {
    // Umm al-Qura months are 29/30 days, so a 40-day stretch must cross one.
    expect(formatHijriSpan('2026-10-01', '2026-11-10', AR)).toContain('–');
  });
});

describe('formatYear', () => {
  it('gives the year alone, in the chosen digits, with no thousands separator', () => {
    expect(formatYear('2026-10-13', EN)).toBe('2026');
    expect(formatYear('2026-10-13', { locale: 'ar', numerals: 'arab' })).toBe('٢٠٢٦');
    expect(formatYear('2026-10-13', { locale: 'ar', numerals: 'latn' })).toBe('2026');
  });
});
