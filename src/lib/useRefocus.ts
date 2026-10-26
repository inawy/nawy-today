import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * Keeps keyboard focus on an event after a key press moved it. The moved item is a new element
 * (another day, another cell), so focus would drop to the page. For a short while after `remember`,
 * focus goes back to the element marked `data-event-id` with the same id as soon as it is lost.
 */
export function useRefocus(): {
  readonly rootRef: RefObject<HTMLDivElement | null>;
  readonly remember: (eventId: string) => void;
} {
  const rootRef = useRef<HTMLDivElement>(null);
  const pending = useRef<{ id: string; until: number } | null>(null);
  const remember = useCallback((id: string): void => {
    pending.current = { id, until: performance.now() + 3000 };
  }, []);

  useEffect(() => {
    const wanted = pending.current;
    if (!wanted) return;
    if (performance.now() > wanted.until) {
      pending.current = null;
      return;
    }
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const items = rootRef.current?.querySelectorAll<HTMLElement>('[data-event-id]');
    const el = [...(items ?? [])].find((e) => e.dataset['eventId'] === wanted.id);
    if (el) {
      el.focus();
      pending.current = null;
    }
  });

  return { rootRef, remember };
}
