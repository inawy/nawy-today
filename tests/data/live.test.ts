// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDb, createStore, watch } from '@/data';
import { counterIds, fakeClock } from '../helpers/factories';

const name = () => `live-${Math.random().toString(36).slice(2)}`;
const until = async (predicate: () => boolean) => {
  for (let i = 0; i < 200 && !predicate(); i += 1) await new Promise((r) => setTimeout(r, 10));
  expect(predicate()).toBe(true);
};

describe('watch', () => {
  it('reports the current result, then every change, and stops after unsubscribe', async () => {
    const db = createDb(name());
    const store = createStore(db, { now: fakeClock().now, newId: counterIds('c') });
    const seen: number[] = [];
    const stop = watch(
      () => store.listCalendars(),
      (list) => seen.push(list.length),
      () => seen.push(-1),
    );
    await until(() => seen.includes(0));
    await store.createCalendar({ name: 'A', color: 'blue' });
    await until(() => seen.at(-1) === 1);
    stop();
    const before = seen.length;
    await store.createCalendar({ name: 'B', color: 'red' });
    await new Promise((r) => setTimeout(r, 80));
    expect(seen.length).toBe(before);
    db.close();
  });

  it('sees a change made through another connection to the same database', async () => {
    const dbName = name();
    const a = createDb(dbName);
    const b = createDb(dbName);
    const storeA = createStore(a, { newId: counterIds('a') });
    const storeB = createStore(b, { newId: counterIds('b') });
    const seen: number[] = [];
    const stop = watch(
      () => storeA.listCalendars(),
      (list) => seen.push(list.length),
      () => seen.push(-1),
    );
    await until(() => seen.includes(0));
    await storeB.createCalendar({ name: 'From another tab', color: 'green' });
    await until(() => seen.at(-1) === 1);
    stop();
    a.close();
    b.close();
  });

  it('reports a failing query through onError', async () => {
    const db = createDb(name());
    const errors: unknown[] = [];
    const stop = watch(
      () => Promise.reject(new Error('boom')),
      () => undefined,
      (e) => errors.push(e),
    );
    await until(() => errors.length > 0);
    stop();
    db.close();
  });
});
