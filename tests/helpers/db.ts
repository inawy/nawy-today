import { createDb, createSnapshotDb, createStore, type StoreDeps } from '@/data';
import { counterIds, fakeClock } from './factories';

// Test files that use these helpers must start with `import 'fake-indexeddb/auto';` so the
// fake IndexedDB exists before Dexie loads.

let counter = 0;
const unique = (base: string): string =>
  `${base}-${++counter}-${Math.random().toString(36).slice(2)}`;

export function testDb() {
  return createDb(unique('test-main'));
}

export function testSnapshotDb() {
  return createSnapshotDb(unique('test-snapshots'));
}

/** A database, a controllable clock and a store wired to both. */
export function testStore(deps: StoreDeps = {}) {
  const db = testDb();
  const clock = fakeClock();
  const store = createStore(db, { now: clock.now, newId: counterIds('id'), ...deps });
  return { db, clock, store };
}
