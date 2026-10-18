import type { CalEvent, Calendar } from '@/core/model';
import { expandEvents } from '@/core/recurrence';
import type { Occurrence } from '@/core/recurrence';
import { normalizeForSearch, searchTokens } from '@/core/search';
import { addDays, epochDayOf, isoOfEpochMinute, toEpochMinute } from '@/core/time';
import type { PlainDate } from '@/core/time';
import { colorOf, prepareData } from '@/features/common/prepare';

// Live search over the user's events (title, location, notes). The index is built once per data
// change; a query is a linear scan of normalised strings, which is far inside the 200 ms budget
// at 5 000 events (measured by a test). Results are ordered by closeness to today.

interface Entry {
  readonly event: CalEvent;
  readonly text: string;
}

export interface SearchIndex {
  readonly entries: readonly Entry[];
  readonly calendars: ReadonlyMap<string, Calendar>;
  /** Stored records that failed validation and are not searchable. */
  readonly skipped: number;
}

export interface SearchResult {
  readonly occurrence: Occurrence;
  readonly calendarColor: string;
}

const textOf = (e: CalEvent): string =>
  normalizeForSearch(`${e.title}\n${e.location ?? ''}\n${e.notes ?? ''}`);

export function buildSearchIndex(
  rawCalendars: readonly unknown[],
  rawEvents: readonly unknown[],
): SearchIndex {
  const { calendars, events, skipped } = prepareData(rawCalendars, rawEvents);
  const byId = new Map(events.map((e) => [e.id, e]));
  const entries: Entry[] = [];
  for (const event of events) {
    const text = textOf(event);
    if (event.seriesId !== undefined) {
      // An override is searchable only when it says something its series does not; otherwise
      // one repeating event would be listed once per edited day.
      const master = byId.get(event.seriesId);
      if (master && textOf(master) === text) continue;
    }
    entries.push({ event, text });
  }
  return { entries, calendars, skipped };
}

const span = (e: CalEvent): number => {
  const s = toEpochMinute(e.start);
  const x = toEpochMinute(e.end);
  return s === undefined || x === undefined ? 0 : Math.max(0, x - s);
};

function plainOccurrence(event: CalEvent): Occurrence {
  return { key: event.id, event, start: event.start, end: event.end, recurring: false, override: false };
}

function overrideOccurrence(event: CalEvent): Occurrence {
  return {
    key: event.id,
    event,
    start: event.start,
    end: event.end,
    ...(event.originalStart !== undefined && { originalStart: event.originalStart }),
    recurring: true,
    override: true,
  };
}

/** The occurrence of a series nearest to today: the next one, else the last one before. */
function seriesOccurrence(master: CalEvent, today: PlainDate): Occurrence {
  const next = expandEvents([master], today, addDays(today, 730), { limitPerSeries: 1 });
  const found = next.occurrences[0];
  if (found) return found;
  const before = expandEvents([master], master.start.slice(0, 10), today);
  const last = before.occurrences[before.occurrences.length - 1];
  if (last) return last;
  const start = master.start;
  const end = isoOfEpochMinute((toEpochMinute(start) ?? 0) + span(master), start.length === 10);
  return { key: master.id, event: master, start, end, originalStart: start, recurring: true, override: false };
}

/**
 * Events containing every word of `query`, nearest to `today` first (ties: the later one first,
 * then by title). An empty query matches nothing.
 */
export function searchEvents(
  index: SearchIndex,
  query: string,
  today: PlainDate,
  limit = 50,
): SearchResult[] {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return [];

  const hits = index.entries.filter((entry) => tokens.every((t) => entry.text.includes(t)));
  const todayDay = epochDayOf(today) ?? 0;
  const ranked = hits.map((entry) => {
    const { event } = entry;
    const occurrence =
      event.seriesId !== undefined
        ? overrideOccurrence(event)
        : event.rrule !== undefined
          ? seriesOccurrence(event, today)
          : plainOccurrence(event);
    const day = epochDayOf(occurrence.start.slice(0, 10)) ?? todayDay;
    return { occurrence, calendarColor: colorOf(event, index.calendars), distance: Math.abs(day - todayDay) };
  });

  ranked.sort(
    (a, b) =>
      a.distance - b.distance ||
      (a.occurrence.start < b.occurrence.start ? 1 : a.occurrence.start > b.occurrence.start ? -1 : 0) ||
      a.occurrence.event.title.localeCompare(b.occurrence.event.title) ||
      (a.occurrence.key < b.occurrence.key ? -1 : 1),
  );
  return ranked
    .slice(0, limit)
    .map(({ occurrence, calendarColor }): SearchResult => ({ occurrence, calendarColor }));
}
