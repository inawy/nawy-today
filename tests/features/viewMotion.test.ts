import { describe, expect, it } from 'vitest';
import { motionBetween } from '@/features/view';
import type { PlainDate } from '@/core/time';

const d = (s: string) => s as PlainDate;

describe('motionBetween', () => {
  it('slides forward when the date moves later', () => {
    expect(
      motionBetween(
        { view: 'week', anchor: d('2026-10-21') },
        { view: 'week', anchor: d('2026-10-28') },
      ),
    ).toBe('next');
  });
  it('slides backward when the date moves earlier', () => {
    expect(
      motionBetween(
        { view: 'month', anchor: d('2026-10-21') },
        { view: 'month', anchor: d('2026-09-21') },
      ),
    ).toBe('previous');
  });
  it('fades when the view itself changes, whatever the date does', () => {
    expect(
      motionBetween(
        { view: 'week', anchor: d('2026-10-21') },
        { view: 'day', anchor: d('2026-10-22') },
      ),
    ).toBe('swap');
  });
  it('does nothing when nothing moved', () => {
    expect(
      motionBetween(
        { view: 'day', anchor: d('2026-10-21') },
        { view: 'day', anchor: d('2026-10-21') },
      ),
    ).toBe('none');
  });
});
