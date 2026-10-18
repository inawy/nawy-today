import { clipToDay } from '@/core/layout';
import { expandEvents } from '@/core/recurrence';
import type { Occurrence, SeriesProblem } from '@/core/recurrence';
import { addDays } from '@/core/time';
import type { PlainDate, PlainDateTime } from '@/core/time';
import { colorOf, prepareData } from '@/features/common/prepare';

// The "Today" list (PRODUCT_SPEC 3.2): one day's events, all-day first, then by time, with a
// marker between what has ended and what is still to come. Same rule as every model: stored
// records are untrusted — a damaged one is skipped and counted, nothing throws.

export type AgendaStatus = 'past' | 'now' | 'upcoming';

export interface AgendaItem {
  readonly key: string;
  readonly occurrence: Occurrence;
  readonly calendarColor: string;
  readonly allDay: boolean;
  /** Where this occurrence starts/ends inside the day, in minutes since midnight (timed only). */
  readonly startMin: number;
  readonly endMin: number;
  readonly status: AgendaStatus;
}

export interface AgendaModel {
  readonly date: PlainDate;
  readonly items: AgendaItem[];
  /** Index where the "now" marker goes (today only): after all-day items and ended events. */
  readonly nowIndex: number | null;
  readonly skipped: number;
  readonly problems: SeriesProblem[];
}

export interface AgendaInput {
  readonly calendars: readonly unknown[];
  readonly events: readonly unknown[];
  readonly date: PlainDate;
  readonly nowLocal: PlainDateTime;
}

function statusOf(date: PlainDate, nowLocal: PlainDateTime, startMin: number, endMin: number) {
  const today = nowLocal.slice(0, 10);
  if (date < today) return 'past';
  if (date > today) return 'upcoming';
  const nowMin = Number(nowLocal.slice(11, 13)) * 60 + Number(nowLocal.slice(14, 16));
  if (endMin <= nowMin && endMin > startMin) return 'past';
  if (endMin <= nowMin && startMin < nowMin) return 'past'; // a zero-length event that already happened
  if (startMin <= nowMin) return 'now';
  return 'upcoming';
}

export function buildAgendaModel(input: AgendaInput): AgendaModel {
  const { calendars, events, skipped } = prepareData(input.calendars, input.events);
  const { occurrences, problems } = expandEvents(events, input.date, addDays(input.date, 1));

  const allDay: AgendaItem[] = [];
  const timed: AgendaItem[] = [];
  for (const o of occurrences) {
    const color = colorOf(o.event, calendars);
    if (o.event.allDay) {
      allDay.push({
        key: o.key,
        occurrence: o,
        calendarColor: color,
        allDay: true,
        startMin: 0,
        endMin: 1440,
        status: input.date < input.nowLocal.slice(0, 10) ? 'past' : 'upcoming',
      });
      continue;
    }
    const span = clipToDay(o.start, o.end, input.date);
    if (!span) continue;
    timed.push({
      key: o.key,
      occurrence: o,
      calendarColor: color,
      allDay: false,
      startMin: span.startMin,
      endMin: span.endMin,
      status: statusOf(input.date, input.nowLocal, span.startMin, span.endMin),
    });
  }

  const byTitle = (a: AgendaItem, b: AgendaItem): number =>
    a.occurrence.event.title.localeCompare(b.occurrence.event.title) ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  allDay.sort(byTitle);
  timed.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin || byTitle(a, b));

  const items = [...allDay, ...timed];
  const isToday = input.date === input.nowLocal.slice(0, 10);
  const nowIndex = isToday ? items.filter((i) => i.allDay || i.status === 'past').length : null;
  return { date: input.date, items, nowIndex, skipped, problems };
}
