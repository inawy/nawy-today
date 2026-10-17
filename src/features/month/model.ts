import { colorOf, prepareData } from '@/features/common/prepare';
import { layoutWeekRow } from '@/core/layout';
import type { BarSegment } from '@/core/layout';
import { expandEvents } from '@/core/recurrence';
import type { Occurrence, SeriesProblem } from '@/core/recurrence';
import { addDays, epochDayOf, monthGrid } from '@/core/time';
import type { IsoWeekday, PlainDate } from '@/core/time';

// Everything the month grid needs, as plain data (ARCHITECTURE: features compute, ui draws).
// Stored records are treated as UNTRUSTED here: a damaged one is skipped and counted, never
// allowed to throw into the render (the "no blank screen" gate of Phase 5).

export interface MonthBar extends BarSegment {
  readonly occurrence: Occurrence;
  readonly calendarColor: string;
  /** Single-day timed event: the UI shows its start time. */
  readonly showTime: boolean;
}

export interface WeekModel {
  readonly days: PlainDate[];
  readonly bars: MonthBar[];
  /** Per column: items touching the day that are not drawn ("+N"). */
  readonly hidden: number[];
}

export interface MonthModel {
  readonly year: number;
  readonly month: number;
  readonly weeks: WeekModel[];
  /** Stored records that failed validation and were left out. */
  readonly skipped: number;
  readonly problems: SeriesProblem[];
}

export interface MonthInput {
  readonly calendars: readonly unknown[];
  readonly events: readonly unknown[];
  readonly year: number;
  readonly month: number;
  readonly weekStart: IsoWeekday;
  readonly maxLanes: number;
}

/** First and last day (inclusive, epoch days) an occurrence is drawn on, or undefined if malformed. */
export function daySpan(o: Occurrence): { startDay: number; endDay: number } | undefined {
  const startDay = epochDayOf(o.start.slice(0, 10));
  const rawEnd = epochDayOf(o.end.slice(0, 10));
  if (startDay === undefined || rawEnd === undefined) return undefined;
  let endDay = rawEnd;
  if (o.event.allDay)
    endDay -= 1; // exclusive end
  else if (o.end.slice(11, 16) === '00:00' && o.end > o.start) endDay -= 1; // ends at midnight
  return { startDay, endDay: Math.max(endDay, startDay) };
}

export function buildMonthModel(input: MonthInput): MonthModel {
  const { calendars, events, skipped } = prepareData(input.calendars, input.events);

  const grid = monthGrid(input.year, input.month, input.weekStart);
  const first = grid[0]?.[0] as PlainDate;
  const last = grid[5]?.[6] as PlainDate;
  const { occurrences, problems } = expandEvents(events, first, addDays(last, 1));

  const byKey = new Map(occurrences.map((o) => [o.key, o]));
  const items = occurrences.flatMap((o) => {
    const span = daySpan(o);
    return span ? [{ id: o.key, ...span }] : [];
  });

  const weeks = grid.map((days): WeekModel => {
    const weekStartDay = epochDayOf(days[0] as PlainDate) as number;
    const row = layoutWeekRow(items, weekStartDay, input.maxLanes);
    const bars = row.segments.flatMap((segment): MonthBar[] => {
      const occurrence = byKey.get(segment.id);
      if (!occurrence) return [];
      const span = daySpan(occurrence);
      const singleDay = span !== undefined && span.startDay === span.endDay;
      return [
        {
          ...segment,
          occurrence,
          calendarColor: colorOf(occurrence.event, calendars),
          showTime: !occurrence.event.allDay && singleDay,
        },
      ];
    });
    return { days, bars, hidden: row.hidden };
  });

  return { year: input.year, month: input.month, weeks, skipped, problems };
}
