import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { createDb } from '@/data';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const phone = (narrow: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: narrow && query.includes('max-width: 599px'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));

const open = () =>
  render(
    <App
      create={() => createDb(`fab-${Math.random().toString(36).slice(2)}`)}
      now={() => Date.UTC(2026, 9, 13, 12, 0)}
      storage={{ getItem: () => null, setItem: () => undefined }}
    />,
  );

const scrollTo = (el: HTMLElement, top: number) => {
  act(() => {
    el.scrollTop = top;
    fireEvent.scroll(el);
  });
};

describe('the add button while scrolling (D-076)', () => {
  it('on a phone it leaves while reading down, comes back on the way up and at the top', async () => {
    phone(true);
    const { container } = open();
    const fab = await screen.findByRole('button', { name: 'Add event' });
    const area = container.querySelector('.main') as HTMLElement;
    expect(fab.getAttribute('data-hidden')).toBeNull();
    scrollTo(area, 0);
    scrollTo(area, 200);
    expect(fab.getAttribute('data-hidden')).toBe('true');
    expect(fab.getAttribute('tabindex')).toBe('-1');
    scrollTo(area, 196); // a tremor of 4px: still hidden
    expect(fab.getAttribute('data-hidden')).toBe('true');
    scrollTo(area, 150);
    expect(fab.getAttribute('data-hidden')).toBeNull();
    scrollTo(area, 400);
    expect(fab.getAttribute('data-hidden')).toBe('true');
    scrollTo(area, 0);
    expect(fab.getAttribute('data-hidden')).toBeNull();
  });

  it('on a wide screen it stays where it is', async () => {
    phone(false);
    const { container } = open();
    const fab = await screen.findByRole('button', { name: 'Add event' });
    const area = container.querySelector('.main') as HTMLElement;
    scrollTo(area, 0);
    scrollTo(area, 400);
    expect(fab.getAttribute('data-hidden')).toBeNull();
  });
});
