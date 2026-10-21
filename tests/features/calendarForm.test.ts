import { describe, expect, it } from 'vitest';
import { cleanCalendarName, suggestColor } from '@/features/calendars';

describe('cleanCalendarName', () => {
  it('trims and collapses spaces', () => {
    expect(cleanCalendarName('  Work   stuff ')).toBe('Work stuff');
  });
  it('rejects empty names', () => {
    expect(cleanCalendarName('   ')).toBeNull();
  });
  it('cuts to the limit without leaving a trailing space', () => {
    expect(cleanCalendarName('abc def', 4)).toBe('abc');
  });
});

describe('suggestColor', () => {
  const palette = ['blue', 'red', 'green'];
  it('takes the first unused colour', () => {
    expect(suggestColor(['blue'], palette)).toBe('red');
  });
  it('starts over when every colour is used', () => {
    expect(suggestColor(['blue', 'red', 'green'], palette)).toBe('blue');
  });
});
