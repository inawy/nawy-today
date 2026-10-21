import { useEffect, useRef, type ReactNode } from 'react';

interface ViewMotionProps {
  readonly motion: 'next' | 'previous' | 'swap' | 'none';
  /** Changes each time the content moves, so the same motion can play twice in a row. */
  readonly tick: number;
  readonly children: ReactNode;
}

const DISTANCE_PX = 28;

/** Plays a short slide/fade on the content; skipped entirely for people who asked for less motion. */
export function ViewMotion({ motion, tick, children }: ViewMotionProps) {
  const ref = useRef<HTMLDivElement>(null);
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
    <div ref={ref} className="view-anim">
      {children}
    </div>
  );
}
