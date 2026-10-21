import { useEffect, useRef, type ReactNode, type TouchEvent } from 'react';
import { swipeIntent, type SwipeIntent } from '@/features/view';

interface ViewMotionProps {
  readonly motion: 'next' | 'previous' | 'swap' | 'none';
  /** Changes each time the content moves, so the same motion can play twice in a row. */
  readonly tick: number;
  /** A deliberate sideways swipe on a touch screen. */
  readonly onSwipe?: ((intent: Exclude<SwipeIntent, null>) => void) | undefined;
  readonly children: ReactNode;
}

const DISTANCE_PX = 28;

/** Plays a short slide/fade on the content; skipped entirely for people who asked for less motion. */
export function ViewMotion({ motion, tick, onSwipe, children }: ViewMotionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; at: number } | null>(null);
  const onTouchStart = (e: TouchEvent): void => {
    const touch = e.touches.length === 1 ? e.touches[0] : undefined;
    start.current = touch ? { x: touch.clientX, y: touch.clientY, at: e.timeStamp } : null;
  };
  const onTouchEnd = (e: TouchEvent): void => {
    const from = start.current;
    const touch = e.changedTouches[0];
    start.current = null;
    if (!from || !touch || !onSwipe) return;
    const rtl = ref.current ? getComputedStyle(ref.current).direction === 'rtl' : false;
    const intent = swipeIntent(
      { dx: touch.clientX - from.x, dy: touch.clientY - from.y, ms: e.timeStamp - from.at },
      rtl,
    );
    if (intent) onSwipe(intent);
  };
  useEffect(() => {
    const el = ref.current;
    if (!el || motion === 'none' || typeof el.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    // "next" brings content in from the reading-end side of the screen.
    const sign = (motion === 'next' ? 1 : -1) * (rtl ? -1 : 1);
    const from =
      motion === 'swap'
        ? { opacity: 0 }
        : { opacity: 0, transform: `translateX(${sign * DISTANCE_PX}px)` };
    const animation = el.animate([from, { opacity: 1, transform: 'none' }], {
      duration: motion === 'swap' ? 160 : 200,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    });
    return () => animation.cancel();
  }, [motion, tick]);
  return (
    <div
      ref={ref}
      className="view-anim"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {children}
    </div>
  );
}
