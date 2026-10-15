import { describe, expect, it } from 'vitest';
import { calendarColorVars } from '@/ui/theme/calendarColor';

describe('calendarColorVars', () => {
  it('maps palette ids to their tokens', () => {
    expect(calendarColorVars('teal')).toEqual({
      bar: 'var(--cal-teal-bar)',
      bg: 'var(--cal-teal-bg)',
    });
  });

  it('accepts a custom #rrggbb', () => {
    expect(calendarColorVars('#12ab90').bar).toBe('#12ab90');
    expect(calendarColorVars('#12ab90').bg).toContain('color-mix');
  });

  it('never lets corrupted data into a style value', () => {
    for (const bad of ['red; background:url(x)', '#12ab9', 'url(javascript:1)', '', 'blue ']) {
      expect(calendarColorVars(bad)).toEqual({
        bar: 'var(--cal-gray-bar)',
        bg: 'var(--cal-gray-bg)',
      });
    }
  });
});
