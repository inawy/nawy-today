import type { PlainDate } from '@/core/time';
import { dateParts } from '@/core/time';

export interface MonthRef {
  readonly year: number;
  readonly month: number; // 1–12
}

export function monthOf(date: PlainDate): MonthRef {
  const { year, month } = dateParts(date);
  return { year, month };
}

export function shiftMonth(ref: MonthRef, delta: number): MonthRef {
  const index = ref.year * 12 + (ref.month - 1) + delta;
  const year = Math.floor(index / 12);
  return { year, month: index - year * 12 + 1 };
}

export function sameMonth(a: MonthRef, b: MonthRef): boolean {
  return a.year === b.year && a.month === b.month;
}
