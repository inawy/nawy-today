import { useEffect } from 'react';

/**
 * Publishes the visible part of the page as CSS variables `--vvh` (height) and `--vvt` (top
 * offset), so a dialog can shrink to the space above an on-screen keyboard instead of hiding
 * behind it. Does nothing where `visualViewport` does not exist.
 */
export function useVisualViewport(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = (): void => {
      root.style.setProperty('--vvh', `${vv.height}px`);
      root.style.setProperty('--vvt', `${vv.offsetTop}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--vvh');
      root.style.removeProperty('--vvt');
    };
  }, []);
}
