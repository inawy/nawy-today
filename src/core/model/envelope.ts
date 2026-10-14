import { err, ok, type Result } from './result';
import type { CalEvent, Calendar } from './types';
import { parseCalendar, parseEvent } from './validate';

// The export/backup file format (D-008). Every parse goes through here, so an import can never
// write anything the app itself could not have written.

export const APP_ID = 'nawy-today';
/** Bump when the file format changes, and add a step to MIGRATIONS for the previous version. */
export const SCHEMA_VERSION = 1;
export const MAX_RECORDS = 200_000;

export interface Envelope {
  app: typeof APP_ID;
  schemaVersion: number;
  exportedAt: number;
  calendars: Calendar[];
  events: CalEvent[];
}

export type EnvelopeError =
  | { code: 'not-json' }
  | { code: 'not-an-envelope' }
  | { code: 'wrong-app'; found: unknown }
  | { code: 'bad-version'; found: unknown }
  /** The file comes from a newer app version: refuse rather than guess (a gap in Nawy Notes). */
  | { code: 'newer-version'; found: number; supported: number }
  | { code: 'no-migration'; from: number }
  | { code: 'invalid-field'; field: string }
  | { code: 'too-many-records'; max: number }
  | { code: 'invalid-record'; kind: 'calendar' | 'event'; index: number; reason: string }
  | { code: 'duplicate-id'; kind: 'calendar' | 'event'; id: string }
  | { code: 'orphan-event'; id: string; calendarId: string };

/** Upgrades a raw envelope from version N to N + 1. */
export type Migration = (envelope: Record<string, unknown>) => Record<string, unknown>;

/** Steps keyed by the version they upgrade FROM. Empty while version 1 is the only version. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export interface EnvelopeOptions {
  /** Overrides, for tests only. */
  currentVersion?: number;
  migrations?: Readonly<Record<number, Migration>>;
  maxRecords?: number;
}

function fail(error: EnvelopeError): Result<never, EnvelopeError> {
  return err(error);
}

export function parseEnvelope(
  text: string,
  options?: EnvelopeOptions,
): Result<Envelope, EnvelopeError> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail({ code: 'not-json' });
  }
  return parseEnvelopeValue(raw, options);
}

export function parseEnvelopeValue(
  raw: unknown,
  options: EnvelopeOptions = {},
): Result<Envelope, EnvelopeError> {
  const current = options.currentVersion ?? SCHEMA_VERSION;
  const migrations = options.migrations ?? MIGRATIONS;
  const maxRecords = options.maxRecords ?? MAX_RECORDS;

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return fail({ code: 'not-an-envelope' });
  }
  let obj = raw as Record<string, unknown>;

  if (obj['app'] !== APP_ID) return fail({ code: 'wrong-app', found: obj['app'] });

  const version = obj['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return fail({ code: 'bad-version', found: version });
  }
  if (version > current) {
    return fail({ code: 'newer-version', found: version, supported: current });
  }

  for (let v = version; v < current; v += 1) {
    const step = migrations[v];
    if (!step) return fail({ code: 'no-migration', from: v });
    obj = { ...step(obj), schemaVersion: v + 1 };
  }

  const exportedAt = obj['exportedAt'];
  if (typeof exportedAt !== 'number' || !Number.isSafeInteger(exportedAt) || exportedAt < 0) {
    return fail({ code: 'invalid-field', field: 'exportedAt' });
  }
  const rawCalendars = obj['calendars'];
  const rawEvents = obj['events'];
  if (!Array.isArray(rawCalendars)) return fail({ code: 'invalid-field', field: 'calendars' });
  if (!Array.isArray(rawEvents)) return fail({ code: 'invalid-field', field: 'events' });
  if (rawCalendars.length > maxRecords || rawEvents.length > maxRecords) {
    return fail({ code: 'too-many-records', max: maxRecords });
  }

  const calendars: Calendar[] = [];
  const calendarIds = new Set<string>();
  for (const [index, item] of rawCalendars.entries()) {
    const parsed = parseCalendar(item);
    if (!parsed.ok)
      return fail({ code: 'invalid-record', kind: 'calendar', index, reason: parsed.error });
    if (calendarIds.has(parsed.value.id)) {
      return fail({ code: 'duplicate-id', kind: 'calendar', id: parsed.value.id });
    }
    calendarIds.add(parsed.value.id);
    calendars.push(parsed.value);
  }

  const events: CalEvent[] = [];
  const eventIds = new Set<string>();
  for (const [index, item] of rawEvents.entries()) {
    const parsed = parseEvent(item);
    if (!parsed.ok)
      return fail({ code: 'invalid-record', kind: 'event', index, reason: parsed.error });
    const event = parsed.value;
    if (eventIds.has(event.id)) return fail({ code: 'duplicate-id', kind: 'event', id: event.id });
    if (!calendarIds.has(event.calendarId)) {
      return fail({ code: 'orphan-event', id: event.id, calendarId: event.calendarId });
    }
    eventIds.add(event.id);
    events.push(event);
  }

  return ok({ app: APP_ID, schemaVersion: current, exportedAt, calendars, events });
}

const byCreatedThenId = (
  a: { createdAt: number; id: string },
  b: { createdAt: number; id: string },
) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Builds an envelope in a deterministic order, so two exports of the same data are identical. */
export function buildEnvelope(
  calendars: readonly Calendar[],
  events: readonly CalEvent[],
  exportedAt: number,
): Envelope {
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    calendars: [...calendars].sort(byCreatedThenId),
    events: [...events].sort(byCreatedThenId),
  };
}

export function serializeEnvelope(envelope: Envelope, pretty = false): string {
  return pretty ? JSON.stringify(envelope, null, 2) : JSON.stringify(envelope);
}
