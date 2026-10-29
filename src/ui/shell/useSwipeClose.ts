import { useRef, type TouchEvent } from 'react';
import { DRAG_START_PX, dragOffset, settleDrag, startsDrag } from '@/features/view';
import type { CloseDirection } from '@/features/view';

export interface SwipeCloseHandlers {
  readonly onTouchStart: (e: TouchEvent<HTMLElement>) => void;
  readonly onTouchMove: (e: TouchEvent<HTMLElement>) => void;
  readonly onTouchEnd: (e: TouchEvent<HTMLElement>) => void;
  readonly onTouchCancel: (e: TouchEvent<HTMLElement>) => void;
}

interface Gesture {
  readonly x: number;
  readonly y: number;
  readonly at: number;
  /** The whole panel that moves: a sheet's `.modal`, or the drawer itself. */
  readonly panel: HTMLElement;
  /** `undefined` until the first few pixels say whether this touch is a drag or something else. */
  dragging: boolean | undefined;
}

const SPRING_MS = 160;

/**
 * Touch handlers that move a panel with the finger and close it after a deliberate swipe in its
 * leaving direction (D-063, D-074). Put them only on the part meant to be grabbed (a sheet's
 * header, the drawer), never on a scrolling or typing area. `enabled: false` turns them off (for
 * example while saving). The movement is drawn straight on the element (no re-render per move).
 */
export function useSwipeClose(
  direction: CloseDirection,
  onClose: () => void,
  enabled = true,
): SwipeCloseHandlers {
  const gesture = useRef<Gesture | null>(null);

  const release = (panel: HTMLElement, animate: boolean): void => {
    panel.style.transition = animate ? `transform ${SPRING_MS}ms var(--ease)` : '';
    panel.style.transform = '';
    if (animate) {
      window.setTimeout(() => {
        panel.style.transition = '';
      }, SPRING_MS + 20);
    }
  };

  return {
    onTouchStart: (e) => {
      const touch = e.touches.length === 1 ? e.touches[0] : undefined;
      if (!touch) {
        gesture.current = null;
        return;
      }
      const panel = (e.currentTarget.closest('.modal') as HTMLElement | null) ?? e.currentTarget;
      gesture.current = {
        x: touch.clientX,
        y: touch.clientY,
        at: e.timeStamp,
        panel,
        dragging: undefined,
      };
    },
    onTouchMove: (e) => {
      const g = gesture.current;
      const touch = e.touches[0];
      if (!enabled || !g || !touch || g.dragging === false) return;
      const move = { dx: touch.clientX - g.x, dy: touch.clientY - g.y };
      if (g.dragging === undefined) {
        if (Math.abs(move.dx) < DRAG_START_PX && Math.abs(move.dy) < DRAG_START_PX) return;
        const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
        g.dragging = startsDrag(move, direction, rtl);
        if (!g.dragging) return;
      }
      const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
      const { x, y } = dragOffset(move, direction, rtl);
      g.panel.style.transition = 'none';
      g.panel.style.transform = `translate(${x}px, ${y}px)`;
    },
    onTouchEnd: (e) => {
      const g = gesture.current;
      const touch = e.changedTouches[0];
      gesture.current = null;
      if (!g) return;
      if (!enabled || !touch) {
        release(g.panel, false);
        return;
      }
      const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
      const move = {
        dx: touch.clientX - g.x,
        dy: touch.clientY - g.y,
        ms: e.timeStamp - g.at,
      };
      if (settleDrag(move, direction, rtl) === 'close') {
        // A drawer glides on from where the finger left it (its own CSS transition); a sheet is
        // removed by the close itself.
        release(g.panel, false);
        onClose();
      } else {
        release(g.panel, g.dragging === true);
      }
    },
    onTouchCancel: () => {
      const g = gesture.current;
      gesture.current = null;
      if (g) release(g.panel, g.dragging === true);
    },
  };
}
