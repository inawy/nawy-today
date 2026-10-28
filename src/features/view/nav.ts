import {
  addDays,
  addMonths,
  addYears,
  formatDate,
  formatDateRange,
  formatHijriDate,
  formatHijriSpan,
  formatMonthTitle,
  formatYear,
  startOfWeek,
} from '@/core/time';
import type { FormatOptions, IsoWeekday, PlainDate } from '@/core/time';

export type ViewKind = 'agenda' | 'day' | 'days3' | 'week' | 'month' | 'year';

/** Moves the anchor date by whole units of the current view. Month moves clamp the day. */
export function shiftAnchor(view: ViewKind, anchor: PlainDate, delta: number): PlainDate {
  switch (view) {
    case 'agenda':
    case 'day':
      return addDays(anchor, delta);
    case 'days3':
      return addDays(anchor, 3 * delta);
    case 'week':
      return addDays(anchor, 7 * delta);
    case 'month':
      return addMonths(anchor, delta);
    case 'year':
      return addYears(anchor, delta);
  }
}

/** The days a view shows for an anchor: 1, 3 starting at the anchor, or 7 for the week. */
export function visibleDays(
  view: 'day' | 'days3' | 'week',
  anchor: PlainDate,
  weekStart: IsoWeekday,
): PlainDate[] {
  if (view === 'day') return [anchor];
  if (view === 'days3') return [anchor, addDays(anchor, 1), addDays(anchor, 2)];
  const start = startOfWeek(anchor, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function viewTitle(
  view: ViewKind,
  anchor: PlainDate,
  weekStart: IsoWeekday,
  fmt: FormatOptions,
): string {
  switch (view) {
    case 'agenda':
    case 'day':
      return formatDate(anchor, fmt, 'full');
    case 'days3': {
      const days = visibleDays('days3', anchor, weekStart);
      return formatDateRange(days[0] as PlainDate, days[2] as PlainDate, fmt);
    }
    case 'week': {
      const days = visibleDays('week', anchor, weekStart);
      return formatDateRange(days[0] as PlainDate, days[6] as PlainDate, fmt);
    }
    case 'month':
      return formatMonthTitle(anchor, fmt);
    case 'year':
      return formatYear(anchor, fmt);
  }
}

/** The Hijri counterpart of the title: the date for one day, the month(s) for anything longer. */
export function hijriSubtitle(
  view: ViewKind,
  anchor: PlainDate,
  weekStart: IsoWeekday,
  fmt: FormatOptions,
): string {
  switch (view) {
    case 'agenda':
    case 'day':
      return formatHijriDate(anchor, fmt);
    case 'days3':
    case 'week': {
      const days = visibleDays(view, anchor, weekStart);
      return formatHijriSpan(days[0] as PlainDate, days[days.length - 1] as PlainDate, fmt);
    }
    case 'month': {
      const first = `${anchor.slice(0, 8)}01` as PlainDate;
      return formatHijriSpan(first, addDays(addMonths(first, 1), -1), fmt);
    }
    case 'year': {
      const first = `${anchor.slice(0, 4)}-01-01` as PlainDate;
      return formatHijriSpan(first, `${anchor.slice(0, 4)}-12-31` as PlainDate, fmt);
    }
  }
}

/**
 * Splits a title at its first comma (Latin or Arabic) so a narrow bar can wrap there and keep the
 * rest, "25 أكتوبر 2026", on one line. A title with no comma is not split.
 */
export function splitTitle(title: string): {
  readonly lead: string | undefined;
  readonly rest: string;
} {
  const m = /^([^،,]+[،,])\s+(.+)$/.exec(title);
  return m ? { lead: m[1], rest: m[2] ?? '' } : { lead: undefined, rest: title };
}
