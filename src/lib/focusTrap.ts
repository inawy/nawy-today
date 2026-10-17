const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab / Shift+Tab inside `container` (for drawers and dialogs). Call from a keydown
 * handler; returns true when it handled the event. Uses `event.code` like every shortcut (D-011).
 */
export function trapTab(
  container: HTMLElement,
  event: Pick<KeyboardEvent, 'code' | 'shiftKey' | 'preventDefault'>,
  active: Element | null = container.ownerDocument.activeElement,
): boolean {
  if (event.code !== 'Tab') return false;
  const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) {
    event.preventDefault();
    return true;
  }
  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && (active === last || !container.contains(active))) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}
