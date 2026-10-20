import { describe, expect, it } from 'vitest';
import { isValidDate, isValidDateTime } from '@/core/time';

// The checks are plain integer arithmetic (fast path for rendering thousands of events); this
// compares them with an independent reference, the JavaScript Date round trip, over every edge.

function realDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');
const YEARS = [0, 1, 4, 100, 400, 1900, 1999, 2000, 2024, 2026, 2100, 2400, 9999];

describe('isValidDate matches the Date round trip', () => {
  it('for every month and day around the edges of every kind of year', () => {
    for (const year of YEARS) {
      for (let month = 0; month <= 13; month += 1) {
        for (let day = 0; day <= 32; day += 1) {
          const text = `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
          expect(isValidDate(text), text).toBe(realDay(year, month, day));
        }
      }
    }
  });

  it('rejects other shapes', () => {
    for (const v of ['', '2026-1-1', '2026-10-13T09:00', '26-10-13', ' 2026-10-13', '2026/10/13']) {
      expect(isValidDate(v), v).toBe(false);
    }
  });
});

describe('isValidDateTime matches the Date round trip', () => {
  it('for every hour and minute edge', () => {
    for (let hour = 0; hour <= 25; hour += 1) {
      for (let minute = 0; minute <= 61; minute += 1) {
        const text = `2026-10-13T${pad(hour)}:${pad(minute)}`;
        expect(isValidDateTime(text), text).toBe(hour <= 23 && minute <= 59);
      }
    }
  });

  it('checks the day too, including leap days', () => {
    expect(isValidDateTime('2024-02-29T10:00')).toBe(true);
    expect(isValidDateTime('2026-02-29T10:00')).toBe(false);
    expect(isValidDateTime('2100-02-29T10:00')).toBe(false);
    expect(isValidDateTime('2000-02-29T10:00')).toBe(true);
    expect(isValidDateTime('2026-13-01T10:00')).toBe(false);
  });

  it('rejects other shapes', () => {
    for (const v of ['', '2026-10-13', '2026-10-13T9:00', '2026-10-13 09:00', '2026-10-13T09:00:00']) {
      expect(isValidDateTime(v), v).toBe(false);
    }
  });
});
