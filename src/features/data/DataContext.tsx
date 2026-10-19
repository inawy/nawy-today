import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  createDb,
  createSnapshotDb,
  createStore,
  maybeTakeDailySnapshot,
  requestPersistence,
  resetDatabase,
} from '@/data';
import type { NawyDb, PersistenceResult, SnapshotDb, Store } from '@/data';

export type DataState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'error';
      readonly retry: () => void;
      /** Snapshots live in their own database, so they may still be readable. */
      readonly snapshotDb: SnapshotDb;
      /** Deletes the unopenable database and starts empty. Resolves false if it could not. */
      readonly reset: () => Promise<boolean>;
    }
  | {
      readonly status: 'ready';
      readonly store: Store;
      readonly db: NawyDb;
      readonly snapshotDb: SnapshotDb;
      readonly persistence: PersistenceResult | 'pending';
    };

const DataContext = createContext<DataState | undefined>(undefined);

export interface DataProviderProps {
  readonly children: ReactNode;
  /** Injectable for tests. */
  readonly create?: () => NawyDb;
  readonly createSnapshots?: () => SnapshotDb;
}

/** Opens the local database once. Failure is a state the UI can show, never a blank page. */
export function DataProvider({
  children,
  create = createDb,
  createSnapshots = createSnapshotDb,
}: DataProviderProps) {
  const snapshotDb = useMemo(() => createSnapshots(), [createSnapshots]);
  const [attempt, setAttempt] = useState(0);
  const [opened, setOpened] = useState<
    { db: NawyDb; store: Store } | { error: NawyDb } | 'loading'
  >('loading');
  const [persistence, setPersistence] = useState<PersistenceResult | 'pending'>('pending');

  useEffect(() => {
    let cancelled = false;
    const db = create();
    setOpened('loading');
    db.open().then(
      () => {
        if (!cancelled) setOpened({ db, store: createStore(db) });
      },
      () => {
        if (!cancelled) setOpened({ error: db });
      },
    );
    return () => {
      cancelled = true;
      db.close();
    };
  }, [create, attempt]);

  // A daily snapshot, once the data is open. Best effort: never blocks or breaks the app.
  useEffect(() => {
    if (typeof opened === 'string' || 'error' in opened) return;
    void maybeTakeDailySnapshot(opened.db, snapshotDb).catch(() => undefined);
  }, [opened, snapshotDb]);

  useEffect(() => {
    if (typeof opened === 'string' || 'error' in opened) return;
    let cancelled = false;
    void requestPersistence().then((result) => {
      if (!cancelled) setPersistence(result);
    });
    return () => {
      cancelled = true;
    };
  }, [opened]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const value = useMemo<DataState>(() => {
    if (opened === 'loading') return { status: 'loading' };
    if ('error' in opened) {
      const name = opened.error.name;
      const reset = async (): Promise<boolean> => {
        const done = await resetDatabase(name);
        if (done) retry();
        return done;
      };
      return { status: 'error', retry, snapshotDb, reset };
    }
    return { status: 'ready', store: opened.store, db: opened.db, snapshotDb, persistence };
  }, [opened, persistence, retry, snapshotDb]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const state = useContext(DataContext);
  if (!state) throw new Error('useData must be used inside <DataProvider>');
  return state;
}
