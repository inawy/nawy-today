import type { PlainDate, PlainDateTime } from '@/core/time';
import { epochDayOf, toEpochMinute } from '@/core/time';

// Wall-clock geometry of one day column. A day is 1440 wall-clock minutes; on a DST-change day
// the real day has 23 or 25 hours, but the grid stays a plain 24 h wall clock (D-005).

export const MINUTES_PER_DAY = 1440;

export interface DaySpan {
  /** Minutes from 00:00, 0…1440. */
  readonly startMin: number;
  readonly endMin: number;
}

/**
 * The part of an event (`start` … `end`, exclusive) that falls on `day`, or `null` when none
 * does. An event across midnight yields a span on each day it touches; a zero-length event
 * yields a zero-length span on the day it sits in.
 */
export function clipToDay(start: string, end: string, day: PlainDate): DaySpan | null {
  const dayNo = epochDayOf(day);
  const s = toEpochMinute(start);
  const e = toEpochMinute(end);
  if (dayNo === undefined || s === undefined || e === undefined) return null;
  const dayStart = dayNo * MINUTES_PER_DAY;
  const dayEnd = dayStart + MINUTES_PER_DAY;
  if (e <= s) {
    return s >= dayStart && s < dayEnd ? { startMin: s - dayStart, endMin: s - dayStart } : null;
  }
  const a = Math.max(s, dayStart);
  const b = Math.min(e, dayEnd);
  return b > a ? { startMin: a - dayStart, endMin: b - dayStart } : null;
}

/** Vertical position of a span as fractions of the day (0…1), with a minimum visible height. */
export function blockPosition(span: DaySpan, minHeightMin = 15): { top: number; height: number } {
  const height = Math.max(span.endMin - span.startMin, minHeightMin);
  const top = Math.min(span.startMin, MINUTES_PER_DAY - Math.min(height, MINUTES_PER_DAY));
  return {
    top: top / MINUTES_PER_DAY,
    height: Math.min(height, MINUTES_PER_DAY) / MINUTES_PER_DAY,
  };
}

/** Where the "now" line goes in the column of `day`: a fraction of the day, or `null` for other days. */
export function nowPosition(now: PlainDateTime, day: PlainDate): number | null {
  if (now.slice(0, 10) !== day) return null;
  const m = toEpochMinute(now);
  const d = epochDayOf(day);
  if (m === undefined || d === undefined) return null;
  return (m - d * MINUTES_PER_DAY) / MINUTES_PER_DAY;
}
