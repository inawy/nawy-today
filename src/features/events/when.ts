import { addDays, compareDates, datePart, formatDate, formatTime } from '@/core/time';
import type { PlainDate, PlainDateTime, TimeFormatOptions } from '@/core/time';

export interface WhenInput {
  readonly start: string;
  readonly end: string;
  readonly allDay: boolean;
  readonly tzid?: string | undefined;
}

/**
 * One line saying when an event happens: the date, then the times (or the dates it spans). An
 * all-day event's end is exclusive in storage, so the last shown day is the one before it.
 * A time zone is named only when it is not the person's own.
 */
export function describeWhen(input: WhenInput, fmt: TimeFormatOptions, localTz: string): string {
  if (input.allDay) {
    const first = input.start as PlainDate;
    const last = addDays(input.end as PlainDate, -1);
    return compareDates(last, first) <= 0
      ? formatDate(first, fmt, 'full')
      : `${formatDate(first, fmt, 'full')} – ${formatDate(last, fmt, 'full')}`;
  }
  const start = input.start as PlainDateTime;
  const end = input.end as PlainDateTime;
  const sd = datePart(start);
  const ed = datePart(end);
  const zone = input.tzid && input.tzid !== localTz ? ` (${input.tzid})` : '';
  if (sd === ed) {
    return `${formatDate(sd, fmt, 'full')} · ${formatTime(start, fmt)} – ${formatTime(end, fmt)}${zone}`;
  }
  return `${formatDate(sd, fmt, 'full')} ${formatTime(start, fmt)} – ${formatDate(ed, fmt, 'full')} ${formatTime(end, fmt)}${zone}`;
}
