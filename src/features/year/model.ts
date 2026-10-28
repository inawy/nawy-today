import { prepareData } from '@/features/common/prepare';
import { daySpan } from '@/features/month';
import { expandEvents } from '@/core/recurrence';
import type { SeriesProblem } from '@/core/recurrence';
import { dateParts, epochDayOf, firstOfMonth, monthGrid } from '@/core/time';
import type { IsoWeekday, PlainDate } from '@/core/time';

// The year view as plain data (D-069): twelve small months, each day with how many events touch
// it. Same rule as the month model: stored records are untrusted, a damaged one is counted and
// left out, never thrown into the render.

export interface YearDay {
  readonly date: PlainDate;
  /** False for the days of the neighbouring months that fill the week rows. */
  readonly inMonth: boolean;
  /** Events and occurrences that touch the day (a multi-day event counts on each of its days). */
  readonly count: number;
}

export interface YearMonth {
  readonly month: number;
  readonly first: PlainDate;
  /** Only rows that hold at least one day of the month (4 to 6). */
  readonly weeks: YearDay[][];
}

export interface YearModel {
  readonly year: number;
  readonly months: YearMonth[];
  readonly skipped: number;
  readonly problems: SeriesProblem[];
}

export interface YearInput {
  readonly calendars: readonly unknown[];
  readonly events: readonly unknown[];
  readonly year: number;
  readonly weekStart: IsoWeekday;
}

export function buildYearModel(input: YearInput): YearModel {
  const { events, skipped } = prepareData(input.calendars, input.events);
  const jan1 = firstOfMonth(input.year, 1);
  const nextJan1 = firstOfMonth(input.year + 1, 1);
  const { occurrences, problems } = expandEvents(events, jan1, nextJan1);

  const from = epochDayOf(jan1) as number;
  const to = (epochDayOf(nextJan1) as number) - 1;
  const counts = new Map<number, number>();
  for (const occurrence of occurrences) {
    const span = daySpan(occurrence);
    if (!span) continue;
    for (let day = Math.max(span.startDay, from); day <= Math.min(span.endDay, to); day += 1) {
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
  }

  const months = Array.from({ length: 12 }, (_, i): YearMonth => {
    const month = i + 1;
    const weeks = monthGrid(input.year, month, input.weekStart)
      .map((row) =>
        row.map((date): YearDay => {
          const inMonth = dateParts(date).month === month && dateParts(date).year === input.year;
          const count = inMonth ? (counts.get(epochDayOf(date) as number) ?? 0) : 0;
          return { date, inMonth, count };
        }),
      )
      .filter((row) => row.some((day) => day.inMonth));
    return { month, first: firstOfMonth(input.year, month), weeks };
  });

  return { year: input.year, months, skipped, problems };
}
