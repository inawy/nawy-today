import { describe, expect, it } from 'vitest';
import { escapeText, foldLine, parseContentLine, unescapeText, unfold } from '@/core/ics/text';

describe('ics text', () => {
  it('joins folded lines and ignores a byte-order mark', () => {
    expect(unfold('\uFEFFA:1\r\nB:long\r\n value\r\n\tmore\r\nC:3')).toEqual([
      'A:1',
      'B:longvaluemore',
      'C:3',
    ]);
  });

  it('reads name, parameters and value, keeping colons inside quotes and values', () => {
    expect(parseContentLine('DTSTART;TZID=Asia/Riyadh:20261025T090000')).toEqual({
      name: 'DTSTART',
      params: { TZID: 'Asia/Riyadh' },
      value: '20261025T090000',
    });
    expect(parseContentLine('ATTENDEE;CN="A; B:C":mailto:x@y.z')).toEqual({
      name: 'ATTENDEE',
      params: { CN: 'A; B:C' },
      value: 'mailto:x@y.z',
    });
    expect(parseContentLine('no colon here')).toBeUndefined();
    expect(parseContentLine(':nameless')).toBeUndefined();
  });

  it('escapes and unescapes text values', () => {
    const text = 'a, b; c\\d\nsecond line';
    expect(escapeText(text)).toBe('a\\, b\; c\\\\d\\nsecond line');
    expect(unescapeText(escapeText(text))).toBe(text);
  });

  it('folds long lines at 75 octets without splitting Arabic letters', () => {
    const arabic = 'س'.repeat(100); // 2 octets each
    const folded = foldLine(`SUMMARY:${arabic}`);
    const physical = folded.split('\r\n');
    expect(physical.length).toBeGreaterThan(1);
    for (const p of physical) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    expect(unfold(folded)).toEqual([`SUMMARY:${arabic}`]);
  });
});
