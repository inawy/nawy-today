import { useCallback, useState } from 'react';
import { loadRecent, rememberQuery, saveRecent } from './recent';
import type { RecentReadable, RecentWritable } from './recent';

export interface RecentSearches {
  readonly recent: readonly string[];
  readonly remember: (query: string) => void;
  readonly clear: () => void;
}

export function useRecentSearches(
  storage: (RecentReadable & RecentWritable) | undefined,
): RecentSearches {
  const [recent, setRecent] = useState<readonly string[]>(() => loadRecent(storage));
  const remember = useCallback(
    (query: string) =>
      setRecent((current) => {
        const next = rememberQuery(current, query);
        if (next !== current) saveRecent(storage, next);
        return next;
      }),
    [storage],
  );
  const clear = useCallback(() => {
    setRecent([]);
    saveRecent(storage, []);
  }, [storage]);
  return { recent, remember, clear };
}
