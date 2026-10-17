import { liveQuery } from 'dexie';

/**
 * Re-runs `query` whenever the tables it reads change — also when another tab writes — and
 * reports each result. Returns the unsubscribe function. This is the only door through which
 * the layers above get live data without ever touching Dexie (ARCHITECTURE).
 */
export function watch<T>(
  query: () => Promise<T>,
  onValue: (value: T) => void,
  onError: (error: unknown) => void,
): () => void {
  const subscription = liveQuery(query).subscribe({ next: onValue, error: onError });
  return () => subscription.unsubscribe();
}
