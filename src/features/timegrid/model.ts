import { blockPosition, clipToDay, layoutColumns, layoutWeekRow } from '@/core/layout';
import type { BarSegment } from '@/core/layout';
import { expandEvents } from '@/core/recurrence';
import type { Occurrence, SeriesProblem } from '@/core/recurrence';
import { addDays, epochDayOf } from '@/core/time';
import type { PlainDate } from '@/core/time';
import { colorOf, prepareData } from '@/features/common/prepare';
import { daySpan } from '@/features/month';

// Everything the day and week time grids need, as plain data. Same rule as the month model:
// stored records are untrusted, a damaged one is skipped and counted, nothing throws.

export interface TimedBlock {
  readonly key: string;
  readonly occurrence: Occurrence;
  readonly calendarColor: string;
  /** Fractions of the day column (0…1). */
  readonly top: number;
  readonly height: number;
  /** Side-by-side placement among overlapping events (width = span / columnCount). */
  readonly column: number;
  readonly columnCount: number;
  readonly span: number;
  /** The event began on an earlier day / continues on a later one. */
  readonly startsBefore: boolean;
  readonly endsAfter: boolean;
}

export interface DayColumn {
  readonly date: PlainDate;
  readonly blocks: TimedBlock[];
}

export interface AllDayBar extends BarSegment {
  readonly occurrence: Occurrence;
  readonly calendarColor: string;
}

export interface TimeGridModel {
  readonly days: DayColumn[];
  readonly allDay: {
    readonly bars: AllDayBar[];
    /** Per day: all-day items that are not drawn ("+N"). */
    readonly hidden: number[];
  };
  readonly skipped: number;
  readonly problems: SeriesProblem[];
}

export interface TimeGridInput {
  readonly calendars: readonly unknown[];
  readonly events: readonly unknown[];
  /** Consecutive days: 1 for the day view, 7 for the week view. */
  readonly days: readonly PlainDate[];
  readonly maxAllDayLanes: number;
}

export function buildTimeGridModel(input: TimeGridInput): TimeGridModel {
  const { calendars, events, skipped } = prepareData(input.calendars, input.events);
  const first = input.days[0];
  const last = input.days[input.days.length - 1];
  if (first === undefined || last === undefined) {
    return { days: [], allDay: { bars: [], hidden: [] }, skipped, problems: [] };
  }

  const { occurrences, problems } = expandEvents(events, first, addDays(last, 1));
  const timed = occurrences.filter((o) => !o.event.allDay);
  const allDay = occurrences.filter((o) => o.event.allDay);

  const days = input.days.map((date): DayColumn => {
    const items: { id: string; startMin: number; endMin: number }[] = [];
    const byKey = new Map<string, { o: Occurrence; startsBefore: boolean; endsAfter: boolean }>();
    for (const o of timed) {
      const span = clipToDay(o.start, o.end, date);
      if (!span) continue;
      items.push({ id: o.key, startMin: span.startMin, endMin: span.endMin });
      byKey.set(o.key, {
        o,
        startsBefore: o.start.slice(0, 10) < date,
        endsAfter: o.end.slice(0, 10) > date && span.endMin === 1440,
      });
    }
    const placed = layoutColumns(items);
    const blocks = placed.flatMap((p): TimedBlock[] => {
      const entry = byKey.get(p.id);
      const item = items.find((i) => i.id === p.id);
      if (!entry || !item) return [];
      const { top, height } = blockPosition(item);
      return [
        {
          key: p.id,
          occurrence: entry.o,
          calendarColor: colorOf(entry.o.event, calendars),
          top,
          height,
          column: p.column,
          columnCount: p.columnCount,
          span: p.span,
          startsBefore: entry.startsBefore,
          endsAfter: entry.endsAfter,
        },
      ];
    });
    blocks.sort((a, b) => a.top - b.top || a.column - b.column || a.key.localeCompare(b.key));
    return { date, blocks };
  });

  const byKey = new Map(allDay.map((o) => [o.key, o]));
  const spans = allDay.flatMap((o) => {
    const s = daySpan(o);
    return s ? [{ id: o.key, ...s }] : [];
  });
  const row = layoutWeekRow(
    spans,
    epochDayOf(first) as number,
    input.maxAllDayLanes,
    input.days.length,
  );
  const bars = row.segments.flatMap((segment): AllDayBar[] => {
    const occurrence = byKey.get(segment.id);
    return occurrence
      ? [{ ...segment, occurrence, calendarColor: colorOf(occurrence.event, calendars) }]
      : [];
  });

  return { days, allDay: { bars, hidden: row.hidden }, skipped, problems };
}
