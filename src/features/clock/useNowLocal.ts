import { useEffect, useState } from 'react';
import { localTimeZone, nowLocal, nowMs } from '@/core/time';
import type { PlainDateTime } from '@/core/time';

/** The current local wall-clock time (to the minute), refreshed while the page is open. */
export function useNowLocal(now: () => number = nowMs, refreshEveryMs = 30_000): PlainDateTime {
  const [value, setValue] = useState(() => nowLocal(localTimeZone(), now()));
  useEffect(() => {
    const id = setInterval(() => {
      setValue((current) => {
        const next = nowLocal(localTimeZone(), now());
        return next === current ? current : next;
      });
    }, refreshEveryMs);
    return () => clearInterval(id);
  }, [now, refreshEveryMs]);
  return value;
}
