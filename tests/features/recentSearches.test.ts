import { describe, expect, it } from 'vitest';
import {
  MAX_RECENT_SEARCHES,
  RECENT_SEARCHES_KEY,
  loadRecent,
  parseRecent,
  rememberQuery,
  saveRecent,
} from '@/features/search';

describe('rememberQuery', () => {
  it('puts the newest first and ignores blanks', () => {
    expect(rememberQuery(['a'], 'b')).toEqual(['b', 'a']);
    const list = ['a'];
    expect(rememberQuery(list, '   ')).toBe(list);
  });

  it('moves a repeat to the front, ignoring case and extra spaces', () => {
    expect(rememberQuery(['Dentist', 'school'], '  dentist ')).toEqual(['dentist', 'school']);
    expect(rememberQuery(['x', 'a b'], 'a   b')).toEqual(['a b', 'x']);
  });

  it('keeps at most five', () => {
    let list: readonly string[] = [];
    for (let i = 0; i < 9; i += 1) list = rememberQuery(list, `q${i}`);
    expect(list).toHaveLength(MAX_RECENT_SEARCHES);
    expect(list[0]).toBe('q8');
  });
});

describe('stored recent searches', () => {
  it('survives a round trip', () => {
    const m = new Map<string, string>();
    const storage = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
    saveRecent(storage, ['b', 'a']);
    expect(m.has(RECENT_SEARCHES_KEY)).toBe(true);
    expect(loadRecent(storage)).toEqual(['b', 'a']);
  });

  it('treats corrupt or odd values as an empty or shorter list', () => {
    expect(parseRecent('nope')).toEqual([]);
    expect(parseRecent(['ok', 5, null, 'also'])).toEqual(['ok', 'also']);
    expect(loadRecent({ getItem: () => '{not json' })).toEqual([]);
    expect(loadRecent(undefined)).toEqual([]);
  });

  it('does not throw when the browser refuses to store', () => {
    expect(() =>
      saveRecent(
        {
          setItem: () => {
            throw new Error('full');
          },
        },
        ['a'],
      ),
    ).not.toThrow();
  });
});
