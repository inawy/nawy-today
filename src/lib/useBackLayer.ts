import { useEffect, useRef } from 'react';

/**
 * Lets the browser's Back button (and the phone's back gesture) close a dialog instead of leaving
 * the app. While `active`, one history entry is pushed; Back pops it and calls `onBack`:
 *  - it resolves `true`  → the dialog closed, nothing else to do;
 *  - it resolves `false` → the dialog stays (e.g. it could not save), so the entry is pushed again
 *    and Back keeps working.
 * When the dialog closes by itself (Save, Cancel) the pushed entry is removed again with
 * `history.back()` so the history does not grow.
 */
export function useBackLayer(active: boolean, onBack: () => Promise<boolean>): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) return;
    let entryOnStack = true;
    let disposed = false;
    window.history.pushState({ nawyLayer: true }, '');

    const onPop = (): void => {
      entryOnStack = false; // Back already removed it
      void onBackRef.current().then(
        (closed) => {
          if (!closed && !disposed) {
            window.history.pushState({ nawyLayer: true }, '');
            entryOnStack = true;
          }
        },
        () => {
          if (!disposed) {
            window.history.pushState({ nawyLayer: true }, '');
            entryOnStack = true;
          }
        },
      );
    };
    window.addEventListener('popstate', onPop);
    return () => {
      disposed = true;
      window.removeEventListener('popstate', onPop);
      // The listener is already gone, so the popstate this causes is not mistaken for a Back press.
      if (entryOnStack) window.history.back();
    };
  }, [active]);
}
