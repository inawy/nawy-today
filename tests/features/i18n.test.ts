import { describe, expect, it } from 'vitest';
import { MESSAGES, translate } from '@/features/i18n';
import type { MessageKey } from '@/features/i18n';

describe('messages', () => {
  it('Arabic and English have exactly the same keys, none empty', () => {
    const ar = Object.keys(MESSAGES.ar).sort();
    expect(Object.keys(MESSAGES.en).sort()).toEqual(ar);
    for (const locale of ['ar', 'en'] as const) {
      for (const key of ar as MessageKey[]) {
        expect(MESSAGES[locale][key].trim(), `${locale}.${key}`).not.toBe('');
      }
    }
  });

  it('placeholders match between languages', () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(MESSAGES.ar) as MessageKey[]) {
      expect(names(MESSAGES.en[key]), key).toEqual(names(MESSAGES.ar[key]));
    }
  });
});

describe('translate', () => {
  it('fills placeholders', () => {
    expect(translate('en', 'moreEvents', { count: 3 })).toBe('+3 more');
    expect(translate('ar', 'moreEvents', { count: 3 })).toBe('+3 أخرى');
  });

  it('leaves an unknown placeholder visible instead of throwing', () => {
    expect(translate('en', 'moreEvents', {})).toBe('+{count} more');
  });

  it('returns plain text without params', () => {
    expect(translate('ar', 'today')).toBe('اليوم');
  });
});
