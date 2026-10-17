import { describe, expect, it } from 'vitest';
import { trapTab } from '@/lib/focusTrap';

function setup() {
  document.body.innerHTML = `<div id="c"><button id="a">a</button><input id="b"><button id="z">z</button></div><button id="out">out</button>`;
  const q = (id: string) => document.getElementById(id) as HTMLElement;
  const calls: string[] = [];
  const event = (shift: boolean) => ({
    code: 'Tab',
    shiftKey: shift,
    preventDefault: () => calls.push('prevented'),
  });
  return { q, calls, event };
}

describe('trapTab', () => {
  it('wraps from the last element to the first on Tab', () => {
    const { q, calls, event } = setup();
    q('z').focus();
    expect(trapTab(q('c'), event(false))).toBe(true);
    expect(document.activeElement).toBe(q('a'));
    expect(calls).toEqual(['prevented']);
  });

  it('wraps from the first to the last on Shift+Tab', () => {
    const { q, event } = setup();
    q('a').focus();
    expect(trapTab(q('c'), event(true))).toBe(true);
    expect(document.activeElement).toBe(q('z'));
  });

  it('pulls focus back in when it is outside the container', () => {
    const { q, event } = setup();
    q('out').focus();
    expect(trapTab(q('c'), event(false))).toBe(true);
    expect(document.activeElement).toBe(q('a'));
  });

  it('leaves Tab alone in the middle, and ignores other keys', () => {
    const { q, event } = setup();
    q('b').focus();
    expect(trapTab(q('c'), event(false))).toBe(false);
    expect(trapTab(q('c'), { ...event(false), code: 'Enter' })).toBe(false);
  });

  it('swallows Tab when nothing inside can take focus', () => {
    document.body.innerHTML = '<div id="c"><span>x</span></div>';
    const container = document.getElementById('c') as HTMLElement;
    let prevented = false;
    expect(
      trapTab(container, {
        code: 'Tab',
        shiftKey: false,
        preventDefault: () => (prevented = true),
      }),
    ).toBe(true);
    expect(prevented).toBe(true);
  });
});
