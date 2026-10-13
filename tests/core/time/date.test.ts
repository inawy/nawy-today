// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  addYears,
  compareDates,
  daysInMonth,
  diffDays,
  endOfMonth,
  firstOfMonth,
  isValidDate,
  monthGrid,
  startOfMonth,
  startOfWeek,
  weekDays,
  weekdayOf,
} from '@/core/time';

// 2026-10-13 is a Tuesday. Week-start constants are ISO weekdays: Mon=1 … Sun=7.
const SAT = 6;
const SUN = 7;
const MON = 1;

describe('isValidDate', () => {
  it.each(['2026-10-13', '2028-02-29', '0001-01-01'])('accepts %s', (v) => {
    expect(isValidDate(v)).toBe(true);
  });

  it.each([
    '2026-02-30', // no such day
    '2027-02-29', // not a leap year
    '2026-13-01',
    '2026-2-3', // not zero-padded
    '2026-10-13T09:00', // a date-time is not a date
    '',
    'tomorrow',
  ])('rejects %j', (v) => {
    expect(isValidDate(v)).toBe(false);
  });
});

describe('addDays / addMonths / addYears', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-10-13', 0)).toBe('2026-10-13');
  });

  it('handles leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('clamps the day when the target month is shorter', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });

  it('moves a leap day to Feb 28 in a non-leap year', () => {
    expect(addYears('2028-02-29', 1)).toBe('2029-02-28');
    expect(addYears('2028-02-29', 4)).toBe('2032-02-29');
  });

  it('throws on invalid input instead of guessing', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
    expect(() => addDays('not-a-date', 1)).toThrow(RangeError);
  });
});

describe('diffDays / compareDates', () => {
  it('counts whole days, signed', () => {
    expect(diffDays('2026-10-13', '2026-10-20')).toBe(7);
    expect(diffDays('2026-10-20', '2026-10-13')).toBe(-7);
    expect(diffDays('2026-10-13', '2026-10-13')).toBe(0);
    expect(diffDays('2026-12-25', '2027-01-05')).toBe(11);
  });

  it('compares chronologically', () => {
    expect(compareDates('2026-10-13', '2026-10-14')).toBe(-1);
    expect(compareDates('2026-10-14', '2026-10-13')).toBe(1);
    expect(compareDates('2026-10-13', '2026-10-13')).toBe(0);
    expect(compareDates('2027-01-01', '2026-12-31')).toBe(1);
  });
});

describe('weekdayOf', () => {
  it('returns the ISO weekday (Mon=1 … Sun=7)', () => {
    expect(weekdayOf('2026-10-12')).toBe(1);
    expect(weekdayOf('2026-10-13')).toBe(2);
    expect(weekdayOf('2026-10-17')).toBe(6);
    expect(weekdayOf('2026-10-18')).toBe(7);
  });
});

describe('startOfWeek / weekDays', () => {
  it('starts on Saturday', () => {
    expect(startOfWeek('2026-10-13', SAT)).toBe('2026-10-10');
    expect(startOfWeek('2026-10-09', SAT)).toBe('2026-10-03'); // a Friday: the week began 6 days earlier
  });

  it('starts on Sunday', () => {
    expect(startOfWeek('2026-10-13', SUN)).toBe('2026-10-11');
  });

  it('starts on Monday', () => {
    expect(startOfWeek('2026-10-13', MON)).toBe('2026-10-12');
  });

  it('returns the date itself when it already is the first day', () => {
    expect(startOfWeek('2026-10-10', SAT)).toBe('2026-10-10');
    expect(startOfWeek('2026-10-12', MON)).toBe('2026-10-12');
  });

  it('crosses a year boundary', () => {
    expect(startOfWeek('2027-01-01', MON)).toBe('2026-12-28');
  });

  it('lists seven consecutive days starting on the week start', () => {
    const days = weekDays('2026-10-13', SAT);
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-10-10');
    expect(days[6]).toBe('2026-10-16');
    expect(days).toEqual([...days].sort());
    expect(new Set(days).size).toBe(7);
  });
});

describe('month helpers', () => {
  it('finds the first and last day of a month', () => {
    expect(startOfMonth('2026-10-13')).toBe('2026-10-01');
    expect(endOfMonth('2026-10-13')).toBe('2026-10-31');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
  });

  it('knows month lengths', () => {
    expect(daysInMonth('2026-04-01')).toBe(30);
    expect(daysInMonth('2026-12-01')).toBe(31);
    expect(daysInMonth('2028-02-01')).toBe(29);
  });

  it('builds a first-of-month and rejects a bad month', () => {
    expect(firstOfMonth(2026, 10)).toBe('2026-10-01');
    expect(() => firstOfMonth(2026, 13)).toThrow(RangeError);
    expect(() => firstOfMonth(2026, 0)).toThrow(RangeError);
  });
});

describe('monthGrid', () => {
  it('is always 6 weeks of 7 days', () => {
    for (const ws of [MON, SAT, SUN] as const) {
      for (const month of [1, 2, 6, 10, 12]) {
        const grid = monthGrid(2026, month, ws);
        expect(grid).toHaveLength(6);
        for (const week of grid) expect(week).toHaveLength(7);
      }
    }
  });

  it('October 2026 starting on Saturday', () => {
    // Oct 1 2026 is a Thursday, so the grid begins on Saturday Sep 26.
    const grid = monthGrid(2026, 10, SAT);
    expect(grid[0]?.[0]).toBe('2026-09-26');
    expect(grid[5]?.[6]).toBe('2026-11-06');
  });

  it('February 2027 starting on Monday begins exactly on the 1st', () => {
    // Feb 1 2027 is a Monday; the sixth week is entirely March.
    const grid = monthGrid(2027, 2, MON);
    expect(grid[0]?.[0]).toBe('2027-02-01');
    expect(grid[5]?.[6]).toBe('2027-03-14');
  });

  it('is a gap-free sequence of days', () => {
    const flat = monthGrid(2026, 10, SAT).flat();
    for (let i = 1; i < flat.length; i++) {
      expect(diffDays(flat[i - 1] ?? '', flat[i] ?? '')).toBe(1);
    }
  });

  it('contains every day of the month exactly once', () => {
    const flat = monthGrid(2026, 10, SUN).flat();
    const inMonth = flat.filter((d) => d.startsWith('2026-10-'));
    expect(inMonth).toHaveLength(31);
    expect(new Set(inMonth).size).toBe(31);
  });

  it('rejects a bad month', () => {
    expect(() => monthGrid(2026, 13, SAT)).toThrow(RangeError);
  });
});
