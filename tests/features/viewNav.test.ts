import { describe, expect, it } from 'vitest';
import { shiftAnchor, shortcutFor, viewTitle, visibleDays } from '@/features/view';
import type { KeyLike } from '@/features/view';

describe('shiftAnchor', () => {
  it('moves by a day, a week or a month', () => {
    expect(shiftAnchor('day', '2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftAnchor('week', '2026-10-13', -1)).toBe('2026-10-06');
    expect(shiftAnchor('month', '2026-10-13', 2)).toBe('2026-12-13');
  });

  it('clamps the day when a month is shorter', () => {
    expect(shiftAnchor('month', '2026-01-31', 1)).toBe('2026-02-28');
    expect(shiftAnchor('month', '2028-03-31', -1)).toBe('2028-02-29');
  });

  it('crosses year boundaries', () => {
    expect(shiftAnchor('day', '2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftAnchor('week', '2026-12-30', 1)).toBe('2027-01-06');
    expect(shiftAnchor('month', '2026-12-15', 1)).toBe('2027-01-15');
  });
});

describe('visibleDays', () => {
  it('is the anchor alone for the day view', () => {
    expect(visibleDays('day', '2026-10-13', 6)).toEqual(['2026-10-13']);
  });

  it('is the seven days of the week, starting on the chosen weekday', () => {
    const sat = visibleDays('week', '2026-10-13', 6);
    expect(sat[0]).toBe('2026-10-10');
    expect(sat[6]).toBe('2026-10-16');
    const mon = visibleDays('week', '2026-10-13', 1);
    expect(mon[0]).toBe('2026-10-12');
    expect(mon[6]).toBe('2026-10-18');
    const sun = visibleDays('week', '2026-10-11', 7); // a Sunday starts its own week
    expect(sun[0]).toBe('2026-10-11');
  });
});

describe('viewTitle', () => {
  const en = { locale: 'en' };
  it('names the day, the week range, or the month', () => {
    expect(viewTitle('day', '2026-10-13', 1, en)).toBe('Tuesday, October 13, 2026');
    expect(viewTitle('month', '2026-10-13', 1, en)).toBe('October 2026');
    const week = viewTitle('week', '2026-10-13', 1, en).replace(/[\s  ]/g, ' ');
    expect(week).toMatch(/^Oct 12 ?[–-] ?18, 2026$/);
  });
});

describe('shortcutFor', () => {
  const key = (code: string, over: Partial<KeyLike> = {}): KeyLike => ({
    code,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...over,
  });

  it('maps physical keys, so an Arabic layout works too', () => {
    expect(shortcutFor(key('KeyT'))).toEqual({ kind: 'today' });
    expect(shortcutFor(key('KeyP'))).toEqual({ kind: 'previous' });
    expect(shortcutFor(key('KeyN'))).toEqual({ kind: 'next' });
    expect(shortcutFor(key('KeyD'))).toEqual({ kind: 'view', view: 'day' });
    expect(shortcutFor(key('KeyW'))).toEqual({ kind: 'view', view: 'week' });
    expect(shortcutFor(key('KeyM'))).toEqual({ kind: 'view', view: 'month' });
  });

  it('ignores other keys', () => {
    expect(shortcutFor(key('KeyZ'))).toBeUndefined();
    expect(shortcutFor(key('ArrowLeft'))).toBeUndefined();
  });

  it('ignores presses with a modifier (browser shortcuts such as Ctrl+N)', () => {
    expect(shortcutFor(key('KeyN', { ctrlKey: true }))).toBeUndefined();
    expect(shortcutFor(key('KeyT', { metaKey: true }))).toBeUndefined();
    expect(shortcutFor(key('KeyW', { altKey: true }))).toBeUndefined();
  });

  it('ignores presses while typing or when already handled', () => {
    for (const tagName of ['INPUT', 'SELECT', 'TEXTAREA']) {
      expect(shortcutFor(key('KeyT', { target: { tagName } }))).toBeUndefined();
    }
    expect(shortcutFor(key('KeyT', { target: { isContentEditable: true } }))).toBeUndefined();
    expect(shortcutFor(key('KeyT', { defaultPrevented: true }))).toBeUndefined();
    expect(shortcutFor(key('KeyT', { target: { tagName: 'BUTTON' } }))).toEqual({ kind: 'today' });
  });
});
