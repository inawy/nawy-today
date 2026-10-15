import type { CalEvent, Id } from '@/core/model';
import { epochDayOf, isoDateOfEpochDay, isoOfEpochMinute, toEpochMinute } from '@/core/time';
import { expandRule, DEFAULT_LIMIT } from './expand';
import type { Rule } from './rule';
import { MAX_COUNT, formatRule, parseRule } from './rule';

// Pure series logic on top of the engine: which concrete occurrences of a set of events fall in
// a window (with EXDATE and moved/edited single occurrences), and how to split a series at
// "this and following". No storage here: the data layer applies the results (Phase 7).
//
// Conventions:
//  - A repeating event keeps its wall-clock duration for every occurrence (a 1 h meeting is 1 h
//    on the wall clock; core/time resolves zones/DST when an instant is needed).
//  - Deleting ONE occurrence is an EXDATE on the master. An override record that is deleted
//    simply stops overriding (the occurrence reverts to the series' own values).
//  - An override whose own time range misses the window is not shown, even if the occurrence it
//    replaces is inside; an override moved INTO the window is shown, even if the occurrence it
//    replaces is outside.

export interface Occurrence {
  /** Stable key for lists: unique per rendered occurrence. */
  readonly key: string;
  /** The record whose fields (title, colour, …) are shown: the override when there is one. */
  readonly event: CalEvent;
  readonly start: string;
  readonly end: string;
  /** Present for occurrences of a repeating series (also for overrides). */
  readonly originalStart?: string;
  readonly recurring: boolean;
  readonly override: boolean;
}

export type SeriesProblem =
  | { kind: 'invalid-rrule'; eventId: Id; detail: string }
  | { kind: 'truncated'; eventId: Id }
  | { kind: 'orphan-override'; eventId: Id };

export interface ExpandResult {
  readonly occurrences: Occurrence[];
  readonly problems: SeriesProblem[];
}

export interface ExpandEventsOptions {
  /** Cap on generated occurrences per series; hitting it is reported as `truncated`. */
  readonly limitPerSeries?: number;
}

const normalize = (s: string): string => (s.length === 10 ? `${s}T00:00` : s.slice(0, 16));

function overlaps(start: string, end: string, fromN: string, toN: string): boolean {
  const s = normalize(start);
  const e = normalize(end);
  if (e <= s) return s >= fromN && s < toN; // zero-length: an instant
  return s < toN && e > fromN;
}

function durationMinutes(event: CalEvent): number {
  const s = toEpochMinute(event.start);
  const e = toEpochMinute(event.end);
  return s === undefined || e === undefined ? 0 : Math.max(0, e - s);
}

export function expandEvents(
  events: readonly CalEvent[],
  from: string,
  to: string,
  options: ExpandEventsOptions = {},
): ExpandResult {
  const limit = options.limitPerSeries ?? DEFAULT_LIMIT;
  const fromN = normalize(from);
  const toN = normalize(to);
  const occurrences: Occurrence[] = [];
  const problems: SeriesProblem[] = [];

  const live = events.filter((e) => e.deletedAt === undefined);
  const overridesBySeries = new Map<Id, CalEvent[]>();
  for (const e of live) {
    if (e.seriesId === undefined) continue;
    const list = overridesBySeries.get(e.seriesId) ?? [];
    list.push(e);
    overridesBySeries.set(e.seriesId, list);
  }

  const masters = new Set<Id>();
  for (const event of live) {
    if (event.seriesId !== undefined) continue; // overrides are handled with their master
    let rule: Rule | undefined;
    if (event.rrule !== undefined) {
      const parsed = parseRule(event.rrule);
      if (parsed.ok) rule = parsed.rule;
      else problems.push({ kind: 'invalid-rrule', eventId: event.id, detail: parsed.error });
    }

    if (rule === undefined) {
      // Not repeating (or a broken rule, which is reported and shown once rather than lost).
      if (overlaps(event.start, event.end, fromN, toN)) {
        occurrences.push({
          key: event.id,
          event,
          start: event.start,
          end: event.end,
          recurring: false,
          override: false,
        });
      }
      continue;
    }

    masters.add(event.id);
    const duration = durationMinutes(event);
    const dateOnly = event.allDay;
    const exdates = new Set(event.exdates ?? []);
    const overrides = overridesBySeries.get(event.id) ?? [];
    const overridden = new Set(overrides.map((o) => o.originalStart));

    const fromMinute = toEpochMinute(fromN);
    const genFrom =
      fromMinute === undefined ? fromN : isoOfEpochMinute(fromMinute - duration, false);
    const starts = expandRule(rule, event.start, genFrom, toN, { limit });
    if (starts.length >= limit) problems.push({ kind: 'truncated', eventId: event.id });

    for (const start of starts) {
      if (exdates.has(start) || overridden.has(start)) continue;
      const startMinute = toEpochMinute(start);
      if (startMinute === undefined) continue;
      const end = isoOfEpochMinute(startMinute + duration, dateOnly);
      if (!overlaps(start, end, fromN, toN)) continue;
      occurrences.push({
        key: `${event.id}@${start}`,
        event,
        start,
        end,
        originalStart: start,
        recurring: true,
        override: false,
      });
    }

    for (const override of overrides) {
      if (override.originalStart !== undefined && exdates.has(override.originalStart)) continue;
      if (!overlaps(override.start, override.end, fromN, toN)) continue;
      occurrences.push({
        key: override.id,
        event: override,
        start: override.start,
        end: override.end,
        ...(override.originalStart !== undefined ? { originalStart: override.originalStart } : {}),
        recurring: true,
        override: true,
      });
    }
  }

  for (const [seriesId, list] of overridesBySeries) {
    if (masters.has(seriesId)) continue;
    for (const o of list) problems.push({ kind: 'orphan-override', eventId: o.id });
  }

  occurrences.sort((a, b) => {
    const s = normalize(a.start).localeCompare(normalize(b.start));
    if (s !== 0) return s;
    const e = normalize(a.end).localeCompare(normalize(b.end));
    return e !== 0 ? e : a.key.localeCompare(b.key);
  });
  return { occurrences, problems };
}

// ---------------------------------------------------------------------------------------------

export interface SplitPlan {
  /**
   * The rule of the part BEFORE the split (the original record keeps it), or `null` when the
   * split is at the very first occurrence: then nothing remains before it and the caller should
   * edit the original record in place instead of creating a second one.
   */
  readonly headRule: string | null;
  readonly headExdates: string[];
  /** Rule and exdates of the new series that starts at the split occurrence. */
  readonly tailRule: string;
  readonly tailExdates: string[];
  /** Overrides at or after the split: they now belong to the new series. */
  readonly movedOverrideIds: Id[];
}

export type SplitResult = { ok: true; plan: SplitPlan } | { ok: false; error: string };

const MINUTE = 1;

/**
 * Plans "this and following": `splitAt` is the start of the occurrence being edited. The union of
 * the two resulting series equals the original series (property-tested).
 */
export function splitSeries(
  master: CalEvent,
  splitAt: string,
  overrides: readonly CalEvent[] = [],
): SplitResult {
  if (master.rrule === undefined) return { ok: false, error: 'event is not repeating' };
  const parsed = parseRule(master.rrule);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const rule = parsed.rule;

  const splitMinute = toEpochMinute(splitAt);
  if (splitMinute === undefined || splitAt.length !== master.start.length) {
    return { ok: false, error: 'splitAt must have the same form as the event start' };
  }
  const next = isoOfEpochMinute(splitMinute + (master.allDay ? 1440 : MINUTE), master.allDay);
  if (expandRule(rule, master.start, splitAt, next, { limit: 1 })[0] !== splitAt) {
    return { ok: false, error: 'splitAt is not an occurrence of the series' };
  }

  const before = expandRule(rule, master.start, master.start, splitAt, {
    limit: MAX_COUNT + 1,
  }).length;
  const exdates = master.exdates ?? [];
  const tailExdates = exdates.filter((x) => x >= splitAt);
  const headExdates = exdates.filter((x) => x < splitAt);
  const movedOverrideIds = overrides
    .filter((o) => o.originalStart !== undefined && o.originalStart >= splitAt)
    .map((o) => o.id);

  let tail: Rule = rule;
  if (rule.count !== undefined) tail = { ...rule, count: rule.count - before };

  let headRule: string | null = null;
  if (before > 0) {
    if (rule.count !== undefined) {
      headRule = formatRule({ ...rule, count: before });
    } else {
      const day = epochDayOf(splitAt.slice(0, 10));
      if (day === undefined) return { ok: false, error: 'invalid splitAt' };
      const dayBefore = isoDateOfEpochDay(day - 1);
      headRule = formatRule({
        freq: rule.freq,
        interval: rule.interval,
        byDay: rule.byDay,
        byMonthDay: rule.byMonthDay,
        byMonth: rule.byMonth,
        wkst: rule.wkst,
        until: master.allDay ? dayBefore : `${dayBefore}T23:59`,
      });
    }
  }

  return {
    ok: true,
    plan: { headRule, headExdates, tailRule: formatRule(tail), tailExdates, movedOverrideIds },
  };
}
