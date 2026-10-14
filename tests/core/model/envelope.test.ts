// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  APP_ID,
  SCHEMA_VERSION,
  buildEnvelope,
  parseEnvelope,
  parseEnvelopeValue,
  serializeEnvelope,
  tombstoneEvent,
  type Envelope,
  type EnvelopeError,
} from '@/core/model';
import { T0, makeAllDayEvent, makeCalendar, makeEvent } from '../../helpers/factories';

const sample = (): Envelope =>
  buildEnvelope(
    [makeCalendar(), makeCalendar({ id: 'cal-2', name: 'Work', createdAt: T0 + 1 })],
    [makeEvent(), makeAllDayEvent({ calendarId: 'cal-2' })],
    T0 + 99,
  );

function errorOf(result: ReturnType<typeof parseEnvelopeValue>): EnvelopeError {
  if (result.ok) throw new Error('expected an error');
  return result.error;
}

describe('buildEnvelope / serializeEnvelope', () => {
  it('labels the file and records the version', () => {
    const e = sample();
    expect(e.app).toBe(APP_ID);
    expect(e.schemaVersion).toBe(SCHEMA_VERSION);
    expect(e.exportedAt).toBe(T0 + 99);
  });

  it('is deterministic whatever order the records arrive in', () => {
    const a = buildEnvelope([makeCalendar({ id: 'b' }), makeCalendar({ id: 'a' })], [], 1);
    const b = buildEnvelope([makeCalendar({ id: 'a' }), makeCalendar({ id: 'b' })], [], 1);
    expect(serializeEnvelope(a)).toBe(serializeEnvelope(b));
    expect(a.calendars.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('pretty output is the same data, just indented', () => {
    const e = sample();
    expect(serializeEnvelope(e, true)).toContain('\n  ');
    expect(JSON.parse(serializeEnvelope(e, true))).toEqual(JSON.parse(serializeEnvelope(e)));
  });
});

describe('parseEnvelope', () => {
  it('round-trips through JSON', () => {
    const e = sample();
    expect(parseEnvelope(serializeEnvelope(e))).toEqual({ ok: true, value: e });
  });

  it('keeps tombstones', () => {
    const e = buildEnvelope([makeCalendar()], [tombstoneEvent(makeEvent(), T0 + 5)], 1);
    const parsed = parseEnvelope(serializeEnvelope(e));
    expect(parsed.ok && parsed.value.events[0]?.deletedAt).toBe(T0 + 5);
  });

  it.each([
    ['not JSON', '{nope', 'not-json'],
    ['an array', '[]', 'not-an-envelope'],
    ['null', 'null', 'not-an-envelope'],
    ['a number', '5', 'not-an-envelope'],
  ])('rejects %s', (_label, text, code) => {
    const result = parseEnvelope(text);
    expect(!result.ok && result.error.code).toBe(code);
  });

  it('rejects a file from another app', () => {
    const result = parseEnvelopeValue({ ...sample(), app: 'nawy-notes' });
    expect(errorOf(result)).toEqual({ code: 'wrong-app', found: 'nawy-notes' });
    expect(errorOf(parseEnvelopeValue({}))).toMatchObject({ code: 'wrong-app' });
  });

  it.each([[0], [-1], [1.5], ['1'], [null], [undefined]])('rejects schemaVersion %j', (version) => {
    expect(errorOf(parseEnvelopeValue({ ...sample(), schemaVersion: version }))).toMatchObject({
      code: 'bad-version',
    });
  });

  it('refuses a file written by a NEWER app version instead of guessing', () => {
    const result = parseEnvelopeValue({ ...sample(), schemaVersion: SCHEMA_VERSION + 1 });
    expect(errorOf(result)).toEqual({
      code: 'newer-version',
      found: SCHEMA_VERSION + 1,
      supported: SCHEMA_VERSION,
    });
  });

  it.each([
    ['exportedAt', { exportedAt: 'yesterday' }],
    ['calendars', { calendars: {} }],
    ['events', { events: 'none' }],
  ])('rejects a bad %s', (field, over) => {
    expect(errorOf(parseEnvelopeValue({ ...sample(), ...over }))).toEqual({
      code: 'invalid-field',
      field,
    });
  });

  it('reports which record is invalid and why', () => {
    const e = sample();
    const bad = { ...e, events: [e.events[0], { ...e.events[1], end: '2020-01-01' }] };
    const error = errorOf(parseEnvelopeValue(bad));
    expect(error).toMatchObject({ code: 'invalid-record', kind: 'event', index: 1 });
  });

  it('rejects duplicate ids', () => {
    const e = sample();
    expect(
      errorOf(parseEnvelopeValue({ ...e, calendars: [...e.calendars, e.calendars[0]] })),
    ).toEqual({ code: 'duplicate-id', kind: 'calendar', id: 'cal-1' });
    expect(errorOf(parseEnvelopeValue({ ...e, events: [...e.events, e.events[0]] }))).toEqual({
      code: 'duplicate-id',
      kind: 'event',
      id: 'ev-1',
    });
  });

  it('rejects an event whose calendar is not in the file', () => {
    const e = sample();
    const bad = { ...e, events: [makeEvent({ calendarId: 'ghost' })] };
    expect(errorOf(parseEnvelopeValue(bad))).toEqual({
      code: 'orphan-event',
      id: 'ev-1',
      calendarId: 'ghost',
    });
  });

  it('accepts an event under a deleted calendar (the tombstone is in the file)', () => {
    const e = buildEnvelope(
      [makeCalendar({ name: '', visible: false, deletedAt: T0, updatedAt: T0 })],
      [makeEvent()],
      1,
    );
    expect(parseEnvelopeValue(e).ok).toBe(true);
  });

  it('enforces a record cap', () => {
    const e = sample();
    expect(errorOf(parseEnvelopeValue(e, { maxRecords: 1 }))).toEqual({
      code: 'too-many-records',
      max: 1,
    });
  });

  it('drops unknown top-level and record fields', () => {
    const e = sample();
    const parsed = parseEnvelopeValue({
      ...e,
      extra: true,
      calendars: e.calendars.map((c) => ({ ...c, injected: 1 })),
    });
    expect(parsed.ok && Object.keys(parsed.value).sort()).toEqual(
      ['app', 'calendars', 'events', 'exportedAt', 'schemaVersion'].sort(),
    );
    expect(parsed.ok && 'injected' in (parsed.value.calendars[0] ?? {})).toBe(false);
  });
});

describe('migrations', () => {
  it('runs each step in order and stamps the new version', () => {
    const calls: number[] = [];
    const result = parseEnvelopeValue(sample(), {
      currentVersion: 3,
      migrations: {
        1: (env) => {
          calls.push(1);
          return env;
        },
        2: (env) => {
          calls.push(2);
          return env;
        },
      },
    });
    expect(calls).toEqual([1, 2]);
    expect(result.ok && result.value.schemaVersion).toBe(3);
  });

  it('a migration can reshape the data before validation', () => {
    const result = parseEnvelopeValue(
      {
        ...sample(),
        calendars: sample().calendars.map(({ name, ...rest }) => ({ ...rest, title: name })),
      },
      {
        currentVersion: 2,
        migrations: {
          1: (env) => ({
            ...env,
            calendars: (env['calendars'] as { title: string }[]).map(({ title, ...rest }) => ({
              ...rest,
              name: title,
            })),
          }),
        },
      },
    );
    expect(result.ok && result.value.calendars.map((c) => c.name)).toEqual(['Personal', 'Work']);
  });

  it('fails clearly when a step is missing', () => {
    expect(errorOf(parseEnvelopeValue(sample(), { currentVersion: 2, migrations: {} }))).toEqual({
      code: 'no-migration',
      from: 1,
    });
  });
});
