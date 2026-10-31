import { CALENDAR_COLOR_IDS } from './tokens';
import type { CalendarColorId } from './tokens';

/**
 * CSS values for a calendar's `color` field: a palette id (contrast-checked tokens) or a custom
 * `#rrggbb` (its bar is exactly that colour; contrast against the surface is NOT guaranteed).
 * Anything else falls back to gray, so corrupted data can never inject CSS.
 */
export function calendarColorVars(color: string): { bar: string; bg: string } {
  if ((CALENDAR_COLOR_IDS as readonly string[]).includes(color)) {
    const id = color as CalendarColorId;
    return { bar: `var(--cal-${id}-bar)`, bg: `var(--cal-${id}-bg)` };
  }
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return { bar: color, bg: `color-mix(in srgb, ${color} 16%, var(--nawy-color-surface))` };
  }
  return { bar: 'var(--cal-gray-bar)', bg: 'var(--cal-gray-bg)' };
}
