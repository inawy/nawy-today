import { compareDates, isValidDate, isValidDateTime, isValidTimeZone } from '@/core/time';
import { defined, err, ok, type Result } from './result';
import type { CalEvent, Calendar } from './types';

// Validation is the single gate for everything that gets stored or imported (D-008, D-010).
// It rebuilds each record from known fields only, so unknown keys never reach the database.

export const LIMITS = {
  id: 100,
  name: 200,
  title: 500,
  notes: 20_000,
  location: 500,
  rrule: 1_000,
  exdates: 1_000,
} as const;

const COLOR_RE = /^(#[0-9a-fA-F]{6}|[a-z][a-z0-9-]{0,31})$/;

class Invalid extends Error {}

function fail(message: string): never {
  throw new Invalid(message);
}

function guard<T>(fn: () => T): Result<T> {
  try {
    return ok(fn());
  } catch (e) {
    if (e instanceof Invalid) return err(e.message);
    throw e;
  }
}

type Rec = Record<string, unknown>;

function asRecord(value: unknown, what: string): Rec {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${what} must be an object`);
  }
  return value as Rec;
}

function reqString(o: Rec, key: string, max: number): string {
  const v = o[key];
  if (typeof v !== 'string') fail(`${key} must be a string`);
  if (v.length > max) fail(`${key} is too long (max ${max} characters)`);
  return v;
}

function optString(o: Rec, key: string, max: number): string | undefined {
  return o[key] === undefined ? undefined : reqString(o, key, max);
}

function reqId(o: Rec, key: string): string {
  const v = reqString(o, key, LIMITS.id);
  if (v === '') fail(`${key} must not be empty`);
  return v;
}

function optId(o: Rec, key: string): string | undefined {
  return o[key] === undefined ? undefined : reqId(o, key);
}

function reqBoolean(o: Rec, key: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') fail(`${key} must be a boolean`);
  return v;
}

function reqTimestamp(o: Rec, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
    fail(`${key} must be a non-negative integer (epoch ms)`);
  }
  return v;
}

function optTimestamp(o: Rec, key: string): number | undefined {
  return o[key] === undefined ? undefined : reqTimestamp(o, key);
}

function reqColor(o: Rec, key: string): string {
  const v = reqString(o, key, 32);
  if (!COLOR_RE.test(v)) fail(`${key} must be a palette token or #rrggbb`);
  return v;
}

function optColor(o: Rec, key: string): string | undefined {
  return o[key] === undefined ? undefined : reqColor(o, key);
}

export function parseCalendar(value: unknown): Result<Calendar> {
  return guard(() => {
    const o = asRecord(value, 'calendar');
    const id = reqId(o, 'id');
    const name = reqString(o, 'name', LIMITS.name);
    const color = reqColor(o, 'color');
    const visible = reqBoolean(o, 'visible');
    const createdAt = reqTimestamp(o, 'createdAt');
    const updatedAt = reqTimestamp(o, 'updatedAt');
    const deletedAt = optTimestamp(o, 'deletedAt');

    if (deletedAt === undefined) {
      if (name.trim() === '') fail('name must not be empty');
    } else if (name !== '') {
      fail('a deleted calendar must not keep its name');
    }

    return defined({ id, name, color, visible, createdAt, updatedAt, deletedAt });
  });
}

export function parseEvent(value: unknown): Result<CalEvent> {
  return guard(() => {
    const o = asRecord(value, 'event');
    const id = reqId(o, 'id');
    const calendarId = reqId(o, 'calendarId');
    const title = reqString(o, 'title', LIMITS.title);
    const notes = optString(o, 'notes', LIMITS.notes);
    const location = optString(o, 'location', LIMITS.location);
    const allDay = reqBoolean(o, 'allDay');
    const start = reqString(o, 'start', 32);
    const end = reqString(o, 'end', 32);
    const tzid = optString(o, 'tzid', 64);
    const rrule = optString(o, 'rrule', LIMITS.rrule);
    const seriesId = optId(o, 'seriesId');
    const originalStart = optString(o, 'originalStart', 32);
    const color = optColor(o, 'color');
    const createdAt = reqTimestamp(o, 'createdAt');
    const updatedAt = reqTimestamp(o, 'updatedAt');
    const deletedAt = optTimestamp(o, 'deletedAt');

    // Dates and times. For wall-clock strings of this exact format, string order is time order.
    const matchesKind = (v: string): boolean => (allDay ? isValidDate(v) : isValidDateTime(v));
    if (!matchesKind(start) || !matchesKind(end)) {
      fail(allDay ? 'all-day start/end must be YYYY-MM-DD' : 'start/end must be YYYY-MM-DDTHH:mm');
    }
    if (allDay) {
      if (compareDates(end, start) <= 0) {
        fail('all-day end must be after start (the end date is exclusive)');
      }
      if (tzid !== undefined) fail('an all-day event must not have a tzid');
    } else {
      if (end < start) fail('end must not be before start');
      if (tzid === undefined || !isValidTimeZone(tzid)) {
        fail('a timed event needs a valid IANA tzid');
      }
    }

    let exdates: string[] | undefined;
    const rawExdates = o['exdates'];
    if (rawExdates !== undefined) {
      if (!Array.isArray(rawExdates)) fail('exdates must be an array');
      if (rawExdates.length > LIMITS.exdates) fail('too many exdates');
      exdates = rawExdates.map((x: unknown) => {
        if (typeof x !== 'string' || !matchesKind(x)) {
          fail('each exdate must match the event type (date or date-time)');
        }
        return x;
      });
    }

    if ((seriesId === undefined) !== (originalStart === undefined)) {
      fail('seriesId and originalStart must be given together');
    }
    if (originalStart !== undefined && !matchesKind(originalStart)) {
      fail('originalStart must match the event type (date or date-time)');
    }
    if (seriesId !== undefined && rrule !== undefined) {
      fail('an override of one occurrence cannot repeat itself');
    }

    if (deletedAt !== undefined) {
      const keepsContent =
        title !== '' ||
        [notes, location, rrule, exdates, seriesId, originalStart, color].some(
          (v) => v !== undefined,
        );
      if (keepsContent) fail('a deleted event must not keep content');
    }

    return defined({
      id,
      calendarId,
      title,
      notes,
      location,
      allDay,
      start,
      end,
      tzid,
      rrule,
      exdates,
      seriesId,
      originalStart,
      color,
      createdAt,
      updatedAt,
      deletedAt,
    });
  });
}
