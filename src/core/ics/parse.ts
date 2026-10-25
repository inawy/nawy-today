import { parseRule, formatRule } from '@/core/recurrence';
import {
  addDays,
  addMinutes,
  combine,
  datePart,
  fromInstantMs,
  isValidDate,
  isValidDateTime,
  isValidTimeZone,
  timePart,
  toInstantMs,
} from '@/core/time';
import type { TimeZoneId } from '@/core/time';
import { parseContentLine, unescapeText, unfold } from './text';
import type { ContentLine } from './text';

// An .ics file → plain event records (no ids, no calendar). Pure and forgiving: every piece it
// cannot honour is counted in `skipped`/`notes`, never dropped silently.

export interface IcsEvent {
  readonly uid: string;
  /** Our own id from a file this app exported (`X-NAWY-ID`), used so a re-import is a no-op. */
  readonly nawyId?: string;
  /** Set on an override of one occurrence of the series with the same `uid`. */
  readonly originalStart?: string;
  readonly title: string;
  readonly notes?: string;
  readonly location?: string;
  readonly allDay: boolean;
  readonly start: string;
  readonly end: string;
  readonly tzid?: TimeZoneId;
  readonly rrule?: string;
  readonly exdates: readonly string[];
  /** Epoch ms from LAST-MODIFIED / DTSTAMP, when present. */
  readonly modified?: number;
}

export interface IcsReport {
  /** Events that could not be read at all (no usable start, wrong dates, cancelled…). */
  readonly unreadable: number;
  readonly cancelled: number;
  /** "This and following" overrides and overrides whose series is not in the file. */
  readonly orphanOverrides: number;
  /** Repeat rules we cannot expand: the event is imported once, without repeating. */
  readonly ruleDropped: number;
  /** A named zone this device does not know: the person's own zone was used. */
  readonly unknownZone: number;
  /** Alarms in the file; they are ignored because this app cannot remind (D-002). */
  readonly alarms: number;
  /** Tasks, journals and the like. */
  readonly otherComponents: number;
}

export interface IcsParse {
  readonly isCalendar: boolean;
  readonly name?: string;
  readonly events: readonly IcsEvent[];
  readonly report: IcsReport;
}

interface Counters {
  unreadable: number;
  cancelled: number;
  orphanOverrides: number;
  ruleDropped: number;
  unknownZone: number;
  alarms: number;
  otherComponents: number;
}

/** `20261025`, `20261025T093000`, `20261025T063000Z` → a wall time (zone-resolved) or a date. */
function parseWhen(
  line: ContentLine,
  zone: TimeZoneId,
  counters: Counters,
): { value: string; allDay: boolean; tzid?: TimeZoneId } | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(line.value.trim());
  if (!m) return undefined;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!isValidDate(date)) return undefined;
  if (m[4] === undefined || line.params['VALUE'] === 'DATE') return { value: date, allDay: true };
  const local = combine(date, `${m[4]}:${m[5]}`);
  if (!isValidDateTime(local)) return undefined;
  if (m[7] === 'Z') {
    return { value: fromInstantMs(toInstantMs(local, 'UTC'), zone), allDay: false, tzid: zone };
  }
  const named = line.params['TZID'];
  if (named === undefined) return { value: local, allDay: false, tzid: zone };
  if (isValidTimeZone(named)) return { value: local, allDay: false, tzid: named };
  counters.unknownZone += 1;
  return { value: local, allDay: false, tzid: zone };
}

/** `PT1H30M`, `P1D`, `P2W` → minutes (DST is ignored for D/W here: they add whole days). */
function parseDuration(value: string): { days: number; minutes: number } | undefined {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
    value.trim(),
  );
  if (!m || value.trim() === 'P' || value.trim().endsWith('T')) return undefined;
  const sign = m[1] === '-' ? -1 : 1;
  const days = Number(m[2] ?? 0) * 7 + Number(m[3] ?? 0);
  const minutes = Number(m[4] ?? 0) * 60 + Number(m[5] ?? 0);
  return { days: sign * days, minutes: sign * minutes };
}

function stamp(value: string | undefined): number | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value ?? '');
  if (!m) return undefined;
  const local = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
  return isValidDateTime(local) ? toInstantMs(local, 'UTC') : undefined;
}

/** An UNTIL in UTC (`…Z`) becomes the wall time in the event's own zone, as the engine expects. */
function normalizeRule(
  text: string,
  allDay: boolean,
  tzid: TimeZoneId | undefined,
): string | undefined {
  const fixed = text.replace(/UNTIL=(\d{8})(?:T(\d{6})Z?)?/i, (whole, d: string, t?: string) => {
    if (t === undefined) return allDay ? `UNTIL=${d}` : `UNTIL=${d}T235900`;
    if (!/Z/i.test(whole) || allDay || tzid === undefined) return `UNTIL=${d}T${t}`;
    const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    const utc = combine(date, `${t.slice(0, 2)}:${t.slice(2, 4)}`);
    const local = fromInstantMs(toInstantMs(utc, 'UTC'), tzid);
    return `UNTIL=${local.replace(/[-:]/g, '').slice(0, 13)}00`;
  });
  const parsed = parseRule(fixed);
  return parsed.ok ? formatRule(parsed.rule) : undefined;
}

/** A small deterministic id for events with no UID at all. */
function fallbackUid(title: string, start: string): string {
  let h = 0;
  for (const c of `${title}|${start}`) h = (Math.imul(h, 31) + (c.codePointAt(0) ?? 0)) | 0;
  return `no-uid-${(h >>> 0).toString(36)}`;
}

export function parseIcs(text: string, options: { readonly zone: TimeZoneId }): IcsParse {
  const counters: Counters = {
    unreadable: 0,
    cancelled: 0,
    orphanOverrides: 0,
    ruleDropped: 0,
    unknownZone: 0,
    alarms: 0,
    otherComponents: 0,
  };
  const events: IcsEvent[] = [];
  let isCalendar = false;
  let name: string | undefined;

  // The component currently open: an event we read, or something we skip until its END.
  let current: ContentLine[] | undefined;
  const skipStack: string[] = [];

  for (const raw of unfold(text)) {
    const line = parseContentLine(raw);
    if (!line) continue;

    if (line.name === 'BEGIN') {
      const kind = line.value.trim().toUpperCase();
      if (kind === 'VCALENDAR') {
        isCalendar = true;
      } else if (skipStack.length > 0) {
        skipStack.push(kind);
      } else if (kind === 'VEVENT' && current === undefined) {
        current = [];
      } else if (kind === 'VALARM' && current !== undefined) {
        counters.alarms += 1;
        skipStack.push(kind);
      } else {
        if (kind !== 'VTIMEZONE' && kind !== 'STANDARD' && kind !== 'DAYLIGHT') {
          counters.otherComponents += 1;
        }
        skipStack.push(kind);
      }
      continue;
    }
    if (line.name === 'END') {
      const kind = line.value.trim().toUpperCase();
      if (skipStack.length > 0) {
        skipStack.pop();
      } else if (kind === 'VEVENT' && current !== undefined) {
        const event = readEvent(current, options.zone, counters);
        if (event) events.push(event);
        current = undefined;
      }
      continue;
    }
    if (skipStack.length > 0) continue;
    if (current !== undefined) current.push(line);
    else if (line.name === 'X-WR-CALNAME') name = unescapeText(line.value).trim() || undefined;
  }

  return { isCalendar, name, events: keepOverridesWithSeries(events, counters), report: counters };
}

function readEvent(
  lines: readonly ContentLine[],
  zone: TimeZoneId,
  counters: Counters,
): IcsEvent | undefined {
  const first = (n: string): ContentLine | undefined => lines.find((l) => l.name === n);
  if (first('STATUS')?.value.trim().toUpperCase() === 'CANCELLED') {
    counters.cancelled += 1;
    return undefined;
  }
  const startLine = first('DTSTART');
  const start = startLine ? parseWhen(startLine, zone, counters) : undefined;
  if (!start) {
    counters.unreadable += 1;
    return undefined;
  }
  const { allDay, tzid } = start;

  let end: string | undefined;
  const endLine = first('DTEND');
  const durLine = first('DURATION');
  if (endLine) {
    const e = parseWhen(endLine, zone, counters);
    if (e) end = allDay ? datePart(e.value) : e.allDay ? combine(e.value, '00:00') : e.value;
  } else if (durLine) {
    const d = parseDuration(durLine.value);
    if (d) {
      end = allDay
        ? addDays(start.value, d.days + Math.trunc(d.minutes / 1440))
        : addMinutes(
            combine(addDays(datePart(start.value), d.days), timePart(start.value)),
            d.minutes,
            tzid ?? zone,
          );
    }
  }
  if (end === undefined || end < start.value) end = allDay ? addDays(start.value, 1) : start.value;
  if (allDay && end <= start.value) end = addDays(start.value, 1);

  let originalStart: string | undefined;
  const recId = first('RECURRENCE-ID');
  if (recId) {
    if (recId.params['RANGE']?.toUpperCase() === 'THISANDFUTURE') {
      counters.orphanOverrides += 1;
      return undefined;
    }
    const r = parseWhen(recId, zone, counters);
    if (!r || r.allDay !== allDay) {
      counters.orphanOverrides += 1;
      return undefined;
    }
    originalStart = r.value;
  }

  let rrule: string | undefined;
  const ruleLine = first('RRULE');
  if (ruleLine && originalStart === undefined) {
    rrule = normalizeRule(ruleLine.value, allDay, tzid);
    if (rrule === undefined) counters.ruleDropped += 1;
  }

  const exdates: string[] = [];
  if (rrule !== undefined) {
    for (const line of lines.filter((l) => l.name === 'EXDATE')) {
      for (const part of line.value.split(',')) {
        const parsed = parseWhen({ ...line, value: part }, zone, counters);
        if (parsed && parsed.allDay === allDay) exdates.push(parsed.value);
      }
    }
  }

  const title = unescapeText(first('SUMMARY')?.value ?? '').trim();
  const notes = unescapeText(first('DESCRIPTION')?.value ?? '').trim();
  const location = unescapeText(first('LOCATION')?.value ?? '').trim();
  const nawyId = first('X-NAWY-ID')?.value.trim();
  const modified = stamp(first('LAST-MODIFIED')?.value) ?? stamp(first('DTSTAMP')?.value);

  return {
    uid: first('UID')?.value.trim() || fallbackUid(title, start.value),
    ...(nawyId ? { nawyId } : {}),
    ...(originalStart !== undefined ? { originalStart } : {}),
    title,
    ...(notes ? { notes } : {}),
    ...(location ? { location } : {}),
    allDay,
    start: start.value,
    end,
    ...(tzid !== undefined ? { tzid } : {}),
    ...(rrule !== undefined ? { rrule } : {}),
    exdates,
    ...(modified !== undefined ? { modified } : {}),
  };
}

/** An override only makes sense next to the repeating event it belongs to. */
function keepOverridesWithSeries(events: IcsEvent[], counters: Counters): IcsEvent[] {
  const series = new Set(events.filter((e) => e.originalStart === undefined).map((e) => e.uid));
  return events.filter((e) => {
    if (e.originalStart === undefined || series.has(e.uid)) return true;
    counters.orphanOverrides += 1;
    return false;
  });
}
