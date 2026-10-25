import { buildEnvelope, parseCalendar, parseEvent } from '@/core/model';
import type { CalEvent, Calendar, Envelope } from '@/core/model';
import { parseIcs, serializeIcs } from '@/core/ics';
import type { IcsReport } from '@/core/ics';
import { datePart, nowLocal } from '@/core/time';
import type { TimeZoneId } from '@/core/time';
import { shortHash } from './hash';

// Glue between .ics files and the app's own records (D-044). An import becomes an Envelope, so it
// goes through the same preview, merge and safety snapshot as a JSON backup.

/** A fixed, old "last changed" so importing the same file twice never counts as a change. */
const IMPORT_EPOCH = 1_000;
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

export interface IcsImportReport extends IcsReport {
  /** Events the file had that failed this app's own validation (too long, impossible dates…). */
  readonly invalid: number;
}

export type IcsImport =
  | {
      readonly ok: true;
      readonly envelope: Envelope;
      readonly calendarName: string;
      readonly report: IcsImportReport;
    }
  | {
      readonly ok: false;
      readonly failure: 'not-ics' | 'no-events';
      readonly report?: IcsImportReport;
    };

export interface IcsImportOptions {
  readonly fileName: string;
  readonly zone: TimeZoneId;
  readonly now: number;
  /** Id for the calendar that receives the events (the caller avoids deleted ones). */
  readonly calendarId: string;
}

const baseName = (fileName: string): string => fileName.replace(/\.[^.]*$/, '').trim();

/** The calendar name an import will use, before ids are chosen. */
export function importCalendarName(parsedName: string | undefined, fileName: string): string {
  return (parsedName ?? baseName(fileName)).slice(0, 200).trim() || 'ICS';
}

/** The id a calendar made from this name gets first (the caller adds a suffix if it is taken). */
export function importCalendarId(name: string): string {
  return `ics-${shortHash(name)}`;
}

export function icsToEnvelope(text: string, options: IcsImportOptions): IcsImport {
  const parsed = parseIcs(text, { zone: options.zone });
  if (!parsed.isCalendar) return { ok: false, failure: 'not-ics' };
  const calendarName = importCalendarName(parsed.name, options.fileName);
  const report = { ...parsed.report, invalid: 0 };
  if (parsed.events.length === 0) return { ok: false, failure: 'no-events', report };

  const calendar = parseCalendar({
    id: options.calendarId,
    name: calendarName,
    color: 'teal',
    visible: true,
    createdAt: IMPORT_EPOCH,
    updatedAt: IMPORT_EPOCH,
  });
  if (!calendar.ok) return { ok: false, failure: 'not-ics' };

  const idOf = (e: (typeof parsed.events)[number]): string =>
    e.nawyId !== undefined && ID_RE.test(e.nawyId)
      ? e.nawyId
      : `ics-${shortHash(e.originalStart === undefined ? e.uid : `${e.uid}|${e.originalStart}`)}`;
  const seriesIdOf = new Map<string, string>();
  for (const e of parsed.events) if (e.originalStart === undefined) seriesIdOf.set(e.uid, idOf(e));

  const events: CalEvent[] = [];
  let invalid = 0;
  for (const e of parsed.events) {
    const at = e.modified ?? IMPORT_EPOCH;
    const seriesId = e.originalStart === undefined ? undefined : seriesIdOf.get(e.uid);
    const record = parseEvent({
      id: idOf(e),
      calendarId: options.calendarId,
      title: e.title.slice(0, 500),
      notes: e.notes?.slice(0, 20_000),
      location: e.location?.slice(0, 500),
      allDay: e.allDay,
      start: e.start,
      end: e.end,
      tzid: e.tzid,
      rrule: e.rrule,
      exdates: e.exdates.length > 0 ? e.exdates.slice(0, 1_000) : undefined,
      seriesId,
      originalStart: seriesId === undefined ? undefined : e.originalStart,
      createdAt: at,
      updatedAt: at,
    });
    if (record.ok) events.push(record.value);
    else invalid += 1;
  }
  if (events.length === 0) {
    return { ok: false, failure: 'no-events', report: { ...report, invalid } };
  }

  return {
    ok: true,
    envelope: buildEnvelope([calendar.value], events, options.now),
    calendarName,
    report: { ...report, invalid },
  };
}

/** `nawy-today-2026-10-25.ics`, dated by the person's own calendar. */
export function icsFileName(epochMs: number, zone: TimeZoneId): string {
  return `nawy-today-${datePart(nowLocal(zone, epochMs))}.ics`;
}

export function eventsToIcs(calendars: readonly Calendar[], events: readonly CalEvent[]): string {
  return serializeIcs({ calendars, events, name: 'Nawy Today' });
}
