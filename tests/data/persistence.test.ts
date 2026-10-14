// @vitest-environment node
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { createDb, createStore, getQuotaBytes, requestPersistence } from '@/data';
import { counterIds, fakeClock } from '../helpers/factories';

describe('reopening the database', () => {
  it('keeps the data after the connection is closed and opened again', async () => {
    const name = `reopen-${Math.random().toString(36).slice(2)}`;
    const clock = fakeClock();

    const first = createDb(name);
    const store = createStore(first, { now: clock.now, newId: counterIds('a') });
    const calendar = await store.createCalendar({ name: 'Personal', color: 'blue' });
    const event = await store.createEvent({
      calendarId: calendar.id,
      title: 'Survives a reload',
      allDay: false,
      start: '2026-10-13T09:00',
      end: '2026-10-13T10:00',
      tzid: 'Asia/Riyadh',
    });
    first.close();

    const second = createDb(name);
    const reopened = createStore(second);
    expect(await reopened.listCalendars()).toEqual([calendar]);
    expect(await reopened.listEvents()).toEqual([event]);
    second.close();
  });
});

describe('upgrading a database (pattern check)', () => {
  // The app's own schema is still at version 1, so this checks the Dexie `upgrade()` mechanism
  // we would use for version 2 against fake-indexeddb. It does NOT prove it behaves the same in
  // a real browser (Nawy Notes suspected a problem there, unconfirmed): that is verified in the
  // Playwright phase (D-008).
  it('runs an upgrade step that transforms existing rows', async () => {
    const name = `upgrade-${Math.random().toString(36).slice(2)}`;

    const v1 = new Dexie(name);
    v1.version(1).stores({ items: 'id' });
    await v1.table('items').add({ id: 'a', title: 'old shape' });
    v1.close();

    const v2 = new Dexie(name);
    v2.version(1).stores({ items: 'id' });
    v2.version(2)
      .stores({ items: 'id, kind' })
      .upgrade((tx) =>
        tx
          .table('items')
          .toCollection()
          .modify((item: Record<string, unknown>) => {
            item['kind'] = 'note';
          }),
      );

    expect(await v2.table('items').get('a')).toEqual({ id: 'a', title: 'old shape', kind: 'note' });
    v2.close();
  });
});

describe('requestPersistence', () => {
  it('reports unsupported when the browser has no storage API', async () => {
    expect(await requestPersistence(undefined)).toBe('unsupported');
    expect(await requestPersistence({})).toBe('unsupported');
  });

  it('reports granted when the browser grants it', async () => {
    expect(await requestPersistence({ persist: async () => true })).toBe('granted');
  });

  it('reports denied when the browser refuses — honestly, not as granted', async () => {
    expect(await requestPersistence({ persist: async () => false })).toBe('denied');
  });

  it('does not ask again when storage is already persistent', async () => {
    let asked = 0;
    const result = await requestPersistence({
      persisted: async () => true,
      persist: async () => {
        asked += 1;
        return true;
      },
    });
    expect(result).toBe('granted');
    expect(asked).toBe(0);
  });

  it('treats a throwing browser as denied', async () => {
    expect(
      await requestPersistence({
        persist: async () => {
          throw new Error('nope');
        },
      }),
    ).toBe('denied');
  });
});

describe('getQuotaBytes', () => {
  it('returns the reported quota', async () => {
    expect(await getQuotaBytes({ estimate: async () => ({ quota: 123 }) })).toBe(123);
  });

  it('returns undefined when unknown or failing', async () => {
    expect(await getQuotaBytes(undefined)).toBeUndefined();
    expect(await getQuotaBytes({})).toBeUndefined();
    expect(
      await getQuotaBytes({
        estimate: async () => {
          throw new Error('x');
        },
      }),
    ).toBeUndefined();
  });
});
