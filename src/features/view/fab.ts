/** Scrolling down this far hides the add button; scrolling up this far brings it back (D-076). */
export const FAB_HIDE_PX = 12;
export const FAB_SHOW_PX = 6;

/**
 * Whether the floating add button shows after a scroll of `delta` pixels (positive = the content
 * moved up, i.e. the person is reading further down). Small movements change nothing, so a jittery
 * finger or a momentum tail does not make the button flicker. Near the top it is always shown.
 */
export function fabAfterScroll(visible: boolean, delta: number, atTop: boolean): boolean {
  if (atTop) return true;
  if (delta >= FAB_HIDE_PX) return false;
  if (delta <= -FAB_SHOW_PX) return true;
  return visible;
}
