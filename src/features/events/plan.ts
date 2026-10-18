import type { CalEvent } from '@/core/model';
import { expandRule, formatRule, parseRule, splitSeries } from '@/core/recurrence';
import { addDays, combine, diffDays, isoOfEpochMinute, timePart, toEpochMinute } from '@/core/time';
import type { EventOp, EventPatch, NewEvent } from '@/data';

// Turns "the user changed (or deleted) this occurrence, with this scope" into the exact list of
// writes that the data layer applies atomically (D-024). Pure: no clock, no storage, ids come in
// as a parameter. Every rule here exists so a series is never left half-edited.

export type Scope = 'this' | 'following' | 'all';

/** What the user is working on. */
export interface Target {
  /** The plain event, or the master of a series. */
  readonly master: CalEvent;
  /** All live overrides of the series. */
  readonly overrides: readonly CalEvent[];
  /** The override record of the edited occurrence, when it already has one. */
  readonly override?: CalEvent;
  /** The occurrence's key in the master's own schedule. Absent for a plain event. */
  readonly originalStart?: string;
}

export type PlanError =
  | 'not-repeating'
  | 'split-failed'
  /** The new first date does not satisfy the rule (e.g. "every Monday" but a Tuesday start). */
  | 'start-not-in-rule'
  | 'invalid-rule';

export type Plan = { ok: true; ops: EventOp[] } | { ok: false; error: PlanError };

const ok = (ops: EventOp[]): Plan => ({ ok: true, ops });
const fail = (error: PlanError): Plan => ({ ok: false, error });

export const isSeries = (t: Target): boolean =>
  t.master.rrule !== undefined && t.originalStart !== undefined;

/** The shown start of the occurrence being edited, before the user's changes. */
const occurrenceStart = (t: Target): string =>
  t.override?.start ?? t.originalStart ?? t.master.start;

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/** Patch that writes every user-editable field; optional ones are explicitly cleared. */
function fieldsPatch(fields: NewEvent): EventPatch {
  return {
    calendarId: fields.calendarId,
    title: fields.title,
    notes: fields.notes,
    location: fields.location,
    allDay: fields.allDay,
    start: fields.start,
    end: fields.end,
    tzid: fields.tzid,
    color: fields.color,
    rrule: fields.rrule,
  };
}

/**
 * Moves a schedule anchored at `base` by the same whole days the user moved the edited occurrence
 * (`from` → `fields.start`), taking the time of day from the form. Used so that "all events"
 * shifts the series instead of re-anchoring it on the occurrence that happened to be clicked.
 */
function shiftedSchedule(
  base: string,
  from: string,
  fields: NewEvent,
): { start: string; end: string } {
  const dayDelta = diffDays(from.slice(0, 10), fields.start.slice(0, 10));
  const date = addDays(base.slice(0, 10), dayDelta);
  if (fields.allDay) {
    const span = diffDays(fields.start.slice(0, 10), fields.end.slice(0, 10));
    return { start: date, end: addDays(date, span) };
  }
  const start = combine(date, timePart(fields.start));
  const startMin = toEpochMinute(start);
  const spanMin = (toEpochMinute(fields.end) ?? 0) - (toEpochMinute(fields.start) ?? 0);
  return {
    start,
    end: startMin === undefined ? fields.end : isoOfEpochMinute(startMin + spanMin, false),
  };
}

/** Is `start` itself an occurrence of `rrule`? (The engine counts DTSTART only if it matches.) */
function startMatches(rrule: string, start: string): 'yes' | 'no' | 'invalid' {
  const parsed = parseRule(rrule);
  if (!parsed.ok) return 'invalid';
  const allDay = start.length === 10;
  const next = isoOfEpochMinute((toEpochMinute(start) ?? 0) + (allDay ? 1440 : 1), allDay);
  return expandRule(parsed.rule, start, start, next, { limit: 1 })[0] === start ? 'yes' : 'no';
}

/** Canonical text, so comparing two rules does not depend on how they were written. */
function canonical(rrule: string | undefined): string | undefined {
  if (rrule === undefined) return undefined;
  const parsed = parseRule(rrule);
  return parsed.ok ? formatRule(parsed.rule) : rrule;
}

const ruleChanged = (before: string | undefined, after: string | undefined): boolean =>
  canonical(before) !== canonical(after);

// ---------------------------------------------------------------------------------------------
// Edit

export function planEdit(
  target: Target,
  scope: Scope,
  fields: NewEvent,
  newId: () => string,
): Plan {
  const { master } = target;

  // A plain event: scope does not apply. It may be turned into a series by giving it a rule.
  if (!isSeries(target)) {
    if (master.seriesId !== undefined) {
      // An override whose series is gone: edit the record itself.
      return ok([
        {
          kind: 'update',
          id: master.id,
          patch: { ...fieldsPatch(fields), rrule: undefined },
          expectedUpdatedAt: master.updatedAt,
        },
      ]);
    }
    if (fields.rrule !== undefined) {
      const m = startMatches(fields.rrule, fields.start);
      if (m !== 'yes') return fail(m === 'invalid' ? 'invalid-rule' : 'start-not-in-rule');
    }
    return ok([
      {
        kind: 'update',
        id: master.id,
        patch: { ...fieldsPatch(fields), exdates: undefined },
        expectedUpdatedAt: master.updatedAt,
      },
    ]);
  }

  if (scope === 'this') return planOverrideEdit(target, fields);
  if (scope === 'following') return planFollowing(target, fields, newId);
  return planAll(target, fields, master.start);
}

/** "This event only": one override record for one occurrence. */
function planOverrideEdit(target: Target, fields: NewEvent): Plan {
  const { master, override, originalStart } = target;
  const own = {
    ...fieldsPatch(fields),
    calendarId: master.calendarId,
    rrule: undefined,
    exdates: undefined,
  };
  if (override) {
    return ok([
      { kind: 'update', id: override.id, patch: own, expectedUpdatedAt: override.updatedAt },
    ]);
  }
  if (originalStart === undefined) return fail('not-repeating');
  const created: NewEvent = {
    calendarId: master.calendarId,
    title: fields.title,
    allDay: fields.allDay,
    start: fields.start,
    end: fields.end,
    seriesId: master.id,
    originalStart,
    ...(fields.notes !== undefined && { notes: fields.notes }),
    ...(fields.location !== undefined && { location: fields.location }),
    ...(fields.tzid !== undefined && { tzid: fields.tzid }),
    ...(fields.color !== undefined && { color: fields.color }),
  };
  return ok([{ kind: 'create', event: created }]);
}

/** "All events": the master changes; if its schedule moves, per-occurrence exceptions go. */
function planAll(target: Target, fields: NewEvent, base: string): Plan {
  const { master } = target;
  const schedule = shiftedSchedule(base, occurrenceStart(target), fields);
  const changed =
    schedule.start !== master.start ||
    fields.allDay !== master.allDay ||
    ruleChanged(master.rrule, fields.rrule);

  if (fields.rrule !== undefined && changed) {
    const m = startMatches(fields.rrule, schedule.start);
    if (m !== 'yes') return fail(m === 'invalid' ? 'invalid-rule' : 'start-not-in-rule');
  }

  const ops: EventOp[] = [
    {
      kind: 'update',
      id: master.id,
      patch: {
        ...fieldsPatch(fields),
        start: schedule.start,
        end: schedule.end,
        ...(changed && { exdates: undefined }),
      },
      expectedUpdatedAt: master.updatedAt,
    },
  ];
  if (changed) for (const o of target.overrides) ops.push({ kind: 'delete', id: o.id });
  return ok(ops);
}

/** "This and following": the series is cut before this occurrence and a new one starts here. */
function planFollowing(target: Target, fields: NewEvent, newId: () => string): Plan {
  const { master, originalStart } = target;
  if (master.rrule === undefined || originalStart === undefined) return fail('not-repeating');

  const split = splitSeries(master, originalStart, target.overrides);
  if (!split.ok) return fail('split-failed');
  const plan = split.plan;
  // Cutting at the very first occurrence leaves nothing before it: it is the same as "all".
  if (plan.headRule === null) return planAll(target, fields, master.start);

  const schedule = shiftedSchedule(originalStart, occurrenceStart(target), fields);
  const changedRule = ruleChanged(master.rrule, fields.rrule);
  const tailRule = changedRule ? fields.rrule : plan.tailRule;
  const scheduleMoved = schedule.start !== originalStart || fields.allDay !== master.allDay;

  if (tailRule !== undefined && (changedRule || scheduleMoved)) {
    const m = startMatches(tailRule, schedule.start);
    if (m !== 'yes') return fail(m === 'invalid' ? 'invalid-rule' : 'start-not-in-rule');
  }

  const tailId = newId();
  const tail: NewEvent = {
    calendarId: fields.calendarId,
    title: fields.title,
    allDay: fields.allDay,
    start: schedule.start,
    end: schedule.end,
    ...(fields.notes !== undefined && { notes: fields.notes }),
    ...(fields.location !== undefined && { location: fields.location }),
    ...(fields.tzid !== undefined && { tzid: fields.tzid }),
    ...(fields.color !== undefined && { color: fields.color }),
    ...(tailRule !== undefined && { rrule: tailRule }),
    ...(tailRule !== undefined &&
      !changedRule &&
      plan.tailExdates.length > 0 && { exdates: plan.tailExdates }),
  };

  const ops: EventOp[] = [
    {
      kind: 'update',
      id: master.id,
      patch: {
        rrule: plan.headRule,
        exdates: plan.headExdates.length > 0 ? plan.headExdates : undefined,
      },
      expectedUpdatedAt: master.updatedAt,
    },
    { kind: 'create', event: tail, id: tailId },
  ];

  // Exceptions at or after the cut: kept (moved to the new series) only when the new series has
  // the same schedule, and never for the occurrence the user just edited (its edit replaces it).
  const keep = tailRule !== undefined && !changedRule && !scheduleMoved;
  for (const id of plan.movedOverrideIds) {
    if (keep && id !== target.override?.id) {
      ops.push({ kind: 'update', id, patch: { seriesId: tailId } });
    } else {
      ops.push({ kind: 'delete', id });
    }
  }
  return ok(ops);
}

// ---------------------------------------------------------------------------------------------
// Delete

export function planDelete(target: Target, scope: Scope): Plan {
  const { master } = target;
  if (!isSeries(target)) {
    // An override on its own: deleting it must also hide the occurrence it replaced.
    if (master.seriesId !== undefined) return fail('not-repeating');
    return ok([{ kind: 'delete', id: master.id }]);
  }
  const originalStart = target.originalStart as string;

  if (scope === 'all') return ok([{ kind: 'delete', id: master.id }]);

  if (scope === 'this') {
    const ops: EventOp[] = [
      {
        kind: 'update',
        id: master.id,
        patch: { exdates: sortedUnique([...(master.exdates ?? []), originalStart]) },
        expectedUpdatedAt: master.updatedAt,
      },
    ];
    if (target.override) ops.push({ kind: 'delete', id: target.override.id });
    return ok(ops);
  }

  const split = splitSeries(master, originalStart, target.overrides);
  if (!split.ok) return fail('split-failed');
  const plan = split.plan;
  if (plan.headRule === null) return ok([{ kind: 'delete', id: master.id }]);
  return ok([
    {
      kind: 'update',
      id: master.id,
      patch: {
        rrule: plan.headRule,
        exdates: plan.headExdates.length > 0 ? plan.headExdates : undefined,
      },
      expectedUpdatedAt: master.updatedAt,
    },
    ...plan.movedOverrideIds.map((id): EventOp => ({ kind: 'delete', id })),
  ]);
}
