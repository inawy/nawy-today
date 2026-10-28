import { useRef, type TouchEvent } from 'react';
import { closeSwipe, type CloseDirection } from '@/features/view';

export interface SwipeCloseHandlers {
  readonly onTouchStart: (e: TouchEvent<HTMLElement>) => void;
  readonly onTouchEnd: (e: TouchEvent<HTMLElement>) => void;
}

/**
 * Touch handlers that call `onClose` after a deliberate swipe in the panel's leaving direction
 * (D-063). Put them only on the part meant to be grabbed (a sheet's header, the drawer), never on
 * a scrolling or typing area. `enabled: false` turns them off (for example while saving).
 */
export function useSwipeClose(
  direction: CloseDirection,
  onClose: () => void,
  enabled = true,
): SwipeCloseHandlers {
  const start = useRef<{ x: number; y: number; at: number } | null>(null);
  return {
    onTouchStart: (e) => {
      const touch = e.touches.length === 1 ? e.touches[0] : undefined;
      start.current = touch ? { x: touch.clientX, y: touch.clientY, at: e.timeStamp } : null;
    },
    onTouchEnd: (e) => {
      const from = start.current;
      const touch = e.changedTouches[0];
      start.current = null;
      if (!enabled || !from || !touch) return;
      const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
      const move = {
        dx: touch.clientX - from.x,
        dy: touch.clientY - from.y,
        ms: e.timeStamp - from.at,
      };
      if (closeSwipe(move, direction, rtl)) onClose();
    },
  };
}
