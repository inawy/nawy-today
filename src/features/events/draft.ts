import type { CalEvent } from '@/core/model';
import { formatRule, parseRule } from '@/core/recurrence';
import type { Rule } from '@/core/recurrence';
import {
  addDays,
  combine,
  dateParts,
  datePart,
  diffDays,
  isValidDate,
  isValidTimeZone,
  timePart,
  weekdayOf,
} from '@/core/time';
import type { IsoWeekday } from '@/core/time';
import type { NewEvent } from '@/data';

// The editor's working copy of an event: plain strings and numbers, exactly what the form shows.
// `draftToFields` is the single gate from the form to a storable event; it never throws.

export type RepeatKind = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
export type MonthlyMode = 'day' | 'nth';
export type RepeatEnd =
  { kind: 'never' } | { kind: 'until'; date: string } | { kind: 'count'; count: number };

export interface RepeatDraft {
  kind: RepeatKind;
  interval: number;
  /** Weekly: the chosen weekdays. Empty means "the weekday of the start date". */
  weekdays: IsoWeekday[];
  monthlyMode: MonthlyMode;
  end: RepeatEnd;
  /** The rule the event had when the form opened; kept as is while the user does not touch it. */
  original?: string;
  /** Snapshot of the editable part when opened, to tell "untouched" from "edited". */
  baseline?: string;
}

export interface Draft {
  title: string;
  notes: string;
  location: string;
  calendarId: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  /** For all-day events this is the LAST day (inclusive), as people think of it. */
  endDate: string;
  endTime: string;
  tzid: string;
  /** Kept through edits; the form does not offer it yet. */
  color?: string;
  repeat: RepeatDraft;
}

const NO_REPEAT: RepeatDraft = {
  kind: 'none',
  interval: 1,
  weekdays: [],
  monthlyMode: 'day',
  end: { kind: 'never' },
};

const core = (r: RepeatDraft): string =>
  JSON.stringify([r.kind, r.interval, r.weekdays, r.monthlyMode, r.end]);

/** n-th weekday-of-month of a date: 1…4, or -1 for the 5th (= "the last"). */
function nthOfMonth(date: string): number {
  const n = Math.ceil(dateParts(date).day / 7);
  return n === 5 ? -1 : n;
}

/** Reads a stored rule into form terms; anything the form cannot express becomes `custom`. */
export function repeatFromRule(rrule: string | undefined, startDate: string): RepeatDraft {
  if (rrule === undefined) return NO_REPEAT;
  const custom: RepeatDraft = { ...NO_REPEAT, kind: 'custom', original: rrule };
  const parsed = parseRule(rrule);
  if (!parsed.ok) return custom;
  const r = parsed.rule;
  if (r.wkst !== 1) return custom;

  const end: RepeatEnd =
    r.count !== undefined
      ? { kind: 'count', count: r.count }
      : r.until !== undefined
        ? { kind: 'until', date: r.until.slice(0, 10) }
        : { kind: 'never' };
  const base = { interval: r.interval, end, original: rrule };
  const noBy = r.byDay.length === 0 && r.byMonthDay.length === 0 && r.byMonth.length === 0;
  const first = r.byDay[0];
  let draft: RepeatDraft | undefined;

  if (r.freq === 'DAILY' && noBy) {
    draft = { ...NO_REPEAT, ...base, kind: 'daily' };
  } else if (
    r.freq === 'WEEKLY' &&
    r.byMonthDay.length === 0 &&
    r.byMonth.length === 0 &&
    r.byDay.every((d) => d.nth === undefined)
  ) {
    draft = { ...NO_REPEAT, ...base, kind: 'weekly', weekdays: r.byDay.map((d) => d.day) };
  } else if (r.freq === 'MONTHLY' && r.byMonth.length === 0) {
    const day = dateParts(startDate).day;
    if (noBy || (r.byMonthDay.length === 1 && r.byMonthDay[0] === day && r.byDay.length === 0)) {
      draft = { ...NO_REPEAT, ...base, kind: 'monthly', monthlyMode: 'day' };
    } else if (
      r.byMonthDay.length === 0 &&
      r.byDay.length === 1 &&
      first?.nth === nthOfMonth(startDate) &&
      first.day === weekdayOf(startDate)
    ) {
      draft = { ...NO_REPEAT, ...base, kind: 'monthly', monthlyMode: 'nth' };
    }
  } else if (r.freq === 'YEARLY' && r.byDay.length === 0) {
    const { month, day } = dateParts(startDate);
    const sameDay =
      (r.byMonth.length === 0 && r.byMonthDay.length === 0) ||
      (r.byMonth.length === 1 &&
        r.byMonth[0] === month &&
        r.byMonthDay.length === 1 &&
        r.byMonthDay[0] === day);
    if (sameDay) draft = { ...NO_REPEAT, ...base, kind: 'yearly' };
  }
  if (!draft) return custom;
  return { ...draft, baseline: core(draft) };
}

/** The rule for the form's repeat settings, or `undefined` for "does not repeat". */
export function repeatToRule(
  repeat: RepeatDraft,
  startDate: string,
  allDay: boolean,
): { ok: true; rrule: string | undefined } | { ok: false; error: RepeatError } {
  if (repeat.kind === 'none') return { ok: true, rrule: undefined };
  if (repeat.kind === 'custom') return { ok: true, rrule: repeat.original };
  if (repeat.original !== undefined && repeat.baseline === core(repeat)) {
    return { ok: true, rrule: repeat.original };
  }
  if (!Number.isInteger(repeat.interval) || repeat.interval < 1 || repeat.interval > 999) {
    return { ok: false, error: 'interval' };
  }
  const { month, day } = dateParts(startDate);
  const weekday = weekdayOf(startDate);
  let rule: Rule = {
    freq: 'DAILY',
    interval: repeat.interval,
    byDay: [],
    byMonthDay: [],
    byMonth: [],
    wkst: 1,
  };
  if (repeat.kind === 'weekly') {
    const days = repeat.weekdays.length > 0 ? repeat.weekdays : [weekday];
    rule = { ...rule, freq: 'WEEKLY', byDay: [...new Set(days)].sort().map((d) => ({ day: d })) };
  } else if (repeat.kind === 'monthly') {
    rule =
      repeat.monthlyMode === 'nth'
        ? { ...rule, freq: 'MONTHLY', byDay: [{ day: weekday, nth: nthOfMonth(startDate) }] }
        : { ...rule, freq: 'MONTHLY', byMonthDay: [day] };
  } else if (repeat.kind === 'yearly') {
    rule = { ...rule, freq: 'YEARLY', byMonth: [month], byMonthDay: [day] };
  }
  if (repeat.end.kind === 'count') {
    if (!Number.isInteger(repeat.end.count) || repeat.end.count < 1 || repeat.end.count > 10000) {
      return { ok: false, error: 'count' };
    }
    rule = { ...rule, count: repeat.end.count };
  } else if (repeat.end.kind === 'until') {
    if (!isValidDate(repeat.end.date) || repeat.end.date < startDate) {
      return { ok: false, error: 'until' };
    }
    rule = { ...rule, until: allDay ? repeat.end.date : `${repeat.end.date}T23:59` };
  }
  return { ok: true, rrule: formatRule(rule) };
}

export type RepeatError = 'interval' | 'count' | 'until';

export type DraftError =
  'calendar' | 'start' | 'end' | 'order' | 'timezone' | 'title-too-long' | `repeat-${RepeatError}`;

const MAX_TITLE = 500;

/** A new event on `date`; timed events default to one hour from `time`. */
export function draftForNew(input: {
  date: string;
  time?: string;
  calendarId: string;
  tzid: string;
  allDay?: boolean;
}): Draft {
  const time = input.time ?? '09:00';
  const startMinutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const endMinutes = Math.min(startMinutes + 60, 23 * 60 + 59);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return {
    title: '',
    notes: '',
    location: '',
    calendarId: input.calendarId,
    allDay: input.allDay ?? false,
    startDate: input.date,
    startTime: time,
    endDate: input.date,
    endTime: `${pad(Math.floor(endMinutes / 60))}:${pad(endMinutes % 60)}`,
    tzid: input.tzid,
    repeat: NO_REPEAT,
  };
}

/**
 * The form for an existing event. `start`/`end` are those of the occurrence being edited (an
 * override's own times, or the series' times moved to that occurrence); `rrule` is the series'.
 */
export function draftFromEvent(
  event: CalEvent,
  occurrence: { start: string; end: string },
  fallbackTzid: string,
  rrule: string | undefined = event.rrule,
): Draft {
  const startDate = occurrence.start.slice(0, 10);
  const allDay = event.allDay;
  return {
    title: event.title,
    notes: event.notes ?? '',
    location: event.location ?? '',
    calendarId: event.calendarId,
    allDay,
    startDate,
    startTime: allDay ? '09:00' : timePart(occurrence.start),
    endDate: allDay ? addDays(occurrence.end.slice(0, 10), -1) : datePart(occurrence.end),
    endTime: allDay ? '10:00' : timePart(occurrence.end),
    tzid: event.tzid ?? fallbackTzid,
    ...(event.color !== undefined && { color: event.color }),
    repeat: repeatFromRule(rrule, startDate),
  };
}

export type FieldsResult = { ok: true; fields: NewEvent } | { ok: false; error: DraftError };

/** Form → storable fields. Every failure is a named reason the UI can show next to the field. */
export function draftToFields(draft: Draft): FieldsResult {
  if (draft.calendarId === '') return { ok: false, error: 'calendar' };
  if (draft.title.length > MAX_TITLE) return { ok: false, error: 'title-too-long' };
  if (!isValidDate(draft.startDate)) return { ok: false, error: 'start' };
  if (!isValidDate(draft.endDate)) return { ok: false, error: 'end' };

  let start: string;
  let end: string;
  if (draft.allDay) {
    if (diffDays(draft.startDate, draft.endDate) < 0) return { ok: false, error: 'order' };
    start = draft.startDate;
    end = addDays(draft.endDate, 1); // exclusive (D-005)
  } else {
    if (!/^\d{2}:\d{2}$/.test(draft.startTime)) return { ok: false, error: 'start' };
    if (!/^\d{2}:\d{2}$/.test(draft.endTime)) return { ok: false, error: 'end' };
    try {
      start = combine(draft.startDate, draft.startTime);
      end = combine(draft.endDate, draft.endTime);
    } catch {
      return { ok: false, error: 'start' };
    }
    if (end < start) return { ok: false, error: 'order' };
    if (!isValidTimeZone(draft.tzid)) return { ok: false, error: 'timezone' };
  }

  const rule = repeatToRule(draft.repeat, draft.startDate, draft.allDay);
  if (!rule.ok) return { ok: false, error: `repeat-${rule.error}` };

  const notes = draft.notes.trim();
  const location = draft.location.trim();
  return {
    ok: true,
    fields: {
      calendarId: draft.calendarId,
      title: draft.title.trim(),
      allDay: draft.allDay,
      start,
      end,
      ...(notes !== '' && { notes }),
      ...(location !== '' && { location }),
      ...(!draft.allDay && { tzid: draft.tzid }),
      ...(draft.color !== undefined && { color: draft.color }),
      ...(rule.rrule !== undefined && { rrule: rule.rrule }),
    },
  };
}

/** Has the user changed anything? Decides whether leaving the form must save. */
export function isDirty(a: Draft, b: Draft): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

const TIME_RE = /^\d{2}:\d{2}$/;
const minutesOf = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const timeOf = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Changing the start moves the end with it, so the length stays the same (as people expect from
 * a calendar). A start typed halfway (not yet a valid date or time) changes nothing else.
 */
export function withStart(
  draft: Draft,
  next: { startDate?: string; startTime?: string },
): Draft {
  const startDate = next.startDate ?? draft.startDate;
  const startTime = next.startTime ?? draft.startTime;
  const out: Draft = { ...draft, startDate, startTime };
  if (!isValidDate(startDate) || !isValidDate(draft.startDate) || !isValidDate(draft.endDate)) {
    return out;
  }
  out.endDate = addDays(draft.endDate, diffDays(draft.startDate, startDate));
  if (
    !draft.allDay &&
    draft.startDate === draft.endDate &&
    TIME_RE.test(startTime) &&
    TIME_RE.test(draft.startTime) &&
    TIME_RE.test(draft.endTime)
  ) {
    const length = Math.max(0, minutesOf(draft.endTime) - minutesOf(draft.startTime));
    out.endTime = timeOf(Math.min(minutesOf(startTime) + length, 23 * 60 + 59));
  }
  return out;
}
