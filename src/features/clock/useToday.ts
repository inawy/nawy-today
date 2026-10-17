import { useEffect, useState } from 'react';
import { localTimeZone, nowMs, todayIn } from '@/core/time';
import type { PlainDate } from '@/core/time';

/** Today's date in the device's zone; moves on at midnight without a reload. */
export function useToday(now: () => number = nowMs, checkEveryMs = 30_000): PlainDate {
  const [today, setToday] = useState(() => todayIn(localTimeZone(), now()));
  useEffect(() => {
    const id = setInterval(() => {
      setToday((current) => {
        const next = todayIn(localTimeZone(), now());
        return next === current ? current : next;
      });
    }, checkEveryMs);
    return () => clearInterval(id);
  }, [now, checkEveryMs]);
  return today;
}
