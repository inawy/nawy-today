import { useEffect, useState } from 'react';

function read(query: string): MediaQueryList | undefined {
  try {
    return window.matchMedia?.(query);
  } catch {
    return undefined;
  }
}

/** Whether a CSS media query matches now, and keeps following it. `false` where it cannot ask. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => read(query)?.matches ?? false);
  useEffect(() => {
    const list = read(query);
    if (!list) return undefined;
    const update = (): void => setMatches(list.matches);
    update();
    list.addEventListener?.('change', update);
    return () => list.removeEventListener?.('change', update);
  }, [query]);
  return matches;
}
