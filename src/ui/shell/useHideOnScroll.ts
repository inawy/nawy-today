import { useEffect, useRef, useState } from 'react';
import { fabAfterScroll } from '@/features/view';

/**
 * `true` while the floating button should be on screen: hidden when the person scrolls down
 * through the content (the page or any scrolling area in it), back as soon as they scroll up or
 * reach the top (D-076). `enabled: false` keeps it always shown. Scroll events do not bubble, so
 * they are caught on the way down (capture), and each scroller keeps its own last position.
 */
export function useHideOnScroll(enabled: boolean): boolean {
  const [visible, setVisible] = useState(true);
  const last = useRef(new WeakMap<object, number>());

  useEffect(() => {
    if (!enabled) {
      setVisible(true);
      return;
    }
    const positions = last.current;
    const onScroll = (event: Event): void => {
      const target = event.target;
      const page = target === document || target === window || target === document.documentElement;
      const key: object = page ? window : (target as Element);
      const y = page ? window.scrollY : (target as Element).scrollTop;
      const before = positions.get(key) ?? y;
      positions.set(key, y);
      setVisible((now) => fabAfterScroll(now, y - before, y <= 0));
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('scroll', onScroll);
    };
  }, [enabled]);

  return !enabled || visible;
}
