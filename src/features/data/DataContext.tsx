import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createDb, createStore, requestPersistence } from '@/data';
import type { NawyDb, PersistenceResult, Store } from '@/data';

export type DataState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly retry: () => void }
  | {
      readonly status: 'ready';
      readonly store: Store;
      readonly db: NawyDb;
      readonly persistence: PersistenceResult | 'pending';
    };

const DataContext = createContext<DataState | undefined>(undefined);

export interface DataProviderProps {
  readonly children: ReactNode;
  /** Injectable for tests. */
  readonly create?: () => NawyDb;
}

/** Opens the local database once. Failure is a state the UI can show, never a blank page. */
export function DataProvider({ children, create = createDb }: DataProviderProps) {
  const [attempt, setAttempt] = useState(0);
  const [opened, setOpened] = useState<{ db: NawyDb; store: Store } | 'loading' | 'error'>(
    'loading',
  );
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
        if (!cancelled) setOpened('error');
      },
    );
    return () => {
      cancelled = true;
      db.close();
    };
  }, [create, attempt]);

  useEffect(() => {
    if (typeof opened === 'string') return;
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
    if (opened === 'error') return { status: 'error', retry };
    return { status: 'ready', store: opened.store, db: opened.db, persistence };
  }, [opened, persistence, retry]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const state = useContext(DataContext);
  if (!state) throw new Error('useData must be used inside <DataProvider>');
  return state;
}
