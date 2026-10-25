import { fromInstantMs, isValidDate } from '@/core/time';
import type { CalEvent, Calendar } from '@/core/model';
import { escapeText, foldLine } from './text';

// Events → an .ics file (RFC 5545). No alarms are written: this app does not remind (D-002).

export const PRODID = '-//Nawy Today//AR//EN';

/** `2026-10-25` → `20261025`; `2026-10-25T09:30` → `20261025T093000`. */
export function icsLocal(value: string): string {
  return value.replace(/[-:]/g, '').replace(/^(\d{8}T\d{4})$/, '$100');
}

/** `…Z` UTC stamp for an epoch-ms instant. */
export function icsStamp(epochMs: number): string {
  return `${icsLocal(fromInstantMs(epochMs, 'UTC'))}Z`;
}

function when(name: string, value: string, tzid: string | undefined): string {
  return isValidDate(value) || tzid === undefined
    ? `${name};VALUE=DATE:${icsLocal(value)}`
    : `${name};TZID=${tzid}:${icsLocal(value)}`;
}

export interface IcsInput {
  readonly calendars: readonly Calendar[];
  readonly events: readonly CalEvent[];
  readonly name?: string;
}

export function serializeIcs(input: IcsInput): string {
  const calendarNames = new Map(
    input.calendars.filter((c) => c.deletedAt === undefined).map((c) => [c.id, c.name]),
  );
  const live = input.events.filter(
    (e) => e.deletedAt === undefined && calendarNames.has(e.calendarId),
  );
  const seriesIds = new Set(live.filter((e) => e.seriesId === undefined).map((e) => e.id));

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  if (input.name !== undefined) lines.push(`X-WR-CALNAME:${escapeText(input.name)}`);

  for (const e of live) {
    if (e.seriesId !== undefined && !seriesIds.has(e.seriesId)) continue;
    const tz = e.allDay ? undefined : e.tzid;
    const stamp = icsStamp(e.updatedAt);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.seriesId ?? e.id}@nawy-today`,
      `X-NAWY-ID:${e.id}`,
      `DTSTAMP:${stamp}`,
      `LAST-MODIFIED:${stamp}`,
    );
    if (e.originalStart !== undefined) lines.push(when('RECURRENCE-ID', e.originalStart, tz));
    lines.push(when('DTSTART', e.start, tz), when('DTEND', e.end, tz));
    lines.push(`SUMMARY:${escapeText(e.title)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.notes) lines.push(`DESCRIPTION:${escapeText(e.notes)}`);
    const calendarName = calendarNames.get(e.calendarId);
    if (calendarName) lines.push(`CATEGORIES:${escapeText(calendarName)}`);
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    for (const x of e.exdates ?? []) lines.push(when('EXDATE', x, tz));
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
