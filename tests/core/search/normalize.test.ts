// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeForSearch, searchTokens } from '@/core/search';

describe('normalizeForSearch', () => {
  it('ignores Arabic diacritics and tatweel', () => {
    expect(normalizeForSearch('مَدْرَسَة')).toBe(normalizeForSearch('مدرسه'));
    expect(normalizeForSearch('اجتمـــاع')).toBe('اجتماع');
  });

  it('treats every alef/hamza shape alike', () => {
    for (const w of ['أحمد', 'إحمد', 'آحمد', 'احمد', 'ٱحمد']) {
      expect(normalizeForSearch(w)).toBe('احمد');
    }
    expect(normalizeForSearch('مسؤول')).toBe(normalizeForSearch('مسول'));
    expect(normalizeForSearch('رئيس')).toBe(normalizeForSearch('ريس'));
  });

  it('folds ta marbuta to ha and alef maqsura to ya', () => {
    expect(normalizeForSearch('مدرسة')).toBe(normalizeForSearch('مدرسه'));
    expect(normalizeForSearch('مستشفى')).toBe(normalizeForSearch('مستشفي'));
  });

  it('reads Arabic-Indic and Persian digits as ASCII', () => {
    expect(normalizeForSearch('غرفة ١٢٣')).toBe(normalizeForSearch('غرفه 123'));
    expect(normalizeForSearch('۴۵')).toBe('45');
  });

  it('ignores case, Latin accents, invisible marks and extra spaces', () => {
    expect(normalizeForSearch('  Café   MEETING ')).toBe('cafe meeting');
    expect(normalizeForSearch('a‏b')).toBe('ab');
  });

  it('keeps unrelated letters distinct', () => {
    expect(normalizeForSearch('دار')).not.toBe(normalizeForSearch('دال'));
  });

  it('is idempotent', () => {
    const once = normalizeForSearch('إِجْتِمَاعُ الْمَدْرَسَةِ ١٢ Café');
    expect(normalizeForSearch(once)).toBe(once);
  });
});

describe('searchTokens', () => {
  it('splits into normalised words, none for blank input', () => {
    expect(searchTokens(' اجتماع  المدرسة ')).toEqual(['اجتماع', 'المدرسه']);
    expect(searchTokens('   ')).toEqual([]);
    expect(searchTokens('')).toEqual([]);
  });
});
