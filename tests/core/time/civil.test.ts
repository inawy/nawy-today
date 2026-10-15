import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysInMonthOf,
  epochDayOf,
  fromEpochDay,
  isLeapYear,
  isoDateOfEpochDay,
  isoWeekdayOfEpochDay,
  toEpochDay,
  weekdayOf,
} from '@/core/time';

describe('civil epoch-day arithmetic', () => {
  it('anchors 1970-01-01 at day 0, a Thursday', () => {
    expect(toEpochDay(1970, 1, 1)).toBe(0);
    expect(isoWeekdayOfEpochDay(0)).toBe(4);
    expect(fromEpochDay(0)).toEqual({ year: 1970, month: 1, day: 1 });
  });

  it('knows leap years', () => {
    expect([1900, 2000, 2023, 2024, 2100].map(isLeapYear)).toEqual([
      false,
      true,
      false,
      true,
      false,
    ]);
    expect(daysInMonthOf(2024, 2)).toBe(29);
    expect(daysInMonthOf(2100, 2)).toBe(28);
    expect(daysInMonthOf(2026, 4)).toBe(30);
  });

  it('round-trips every day from year 1 to 9999 (sampled densely)', () => {
    for (let n = toEpochDay(1, 1, 1); n <= toEpochDay(9999, 12, 31); n += 7) {
      const { year, month, day } = fromEpochDay(n);
      expect(toEpochDay(year, month, day)).toBe(n);
    }
  });

  it('agrees with the Temporal-based core/time on dates and weekdays', () => {
    const start = '2000-02-27';
    for (let i = 0; i < 12000; i += 11) {
      const date = addDays(start, i);
      const n = epochDayOf(date);
      expect(n).toBeDefined();
      expect(isoDateOfEpochDay(n as number)).toBe(date);
      expect(isoWeekdayOfEpochDay(n as number)).toBe(weekdayOf(date));
    }
  });

  it('rejects dates that do not exist', () => {
    for (const bad of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '2026-1-1', 'x']) {
      expect(epochDayOf(bad)).toBeUndefined();
    }
    expect(epochDayOf('2024-02-29')).toBeDefined();
  });

  it('handles days before 1970', () => {
    expect(isoDateOfEpochDay(-1)).toBe('1969-12-31');
    expect(isoWeekdayOfEpochDay(-1)).toBe(3);
  });
});
