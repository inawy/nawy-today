import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { createDb, createStore } from '@/data';
import { makeNewEvent } from '../helpers/factories';

const NOW = () => Date.UTC(2026, 9, 13, 12, 0); // Tue 13 Oct 2026

const memoryStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

let dbName = '';
beforeEach(() => {
  dbName = `monthday-${Math.random().toString(36).slice(2)}`;
});
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

async function seed() {
  const db = createDb(dbName);
  const store = createStore(db);
  const calendar = await store.createCalendar({ name: 'Personal', color: 'blue' });
  await store.createEvent(makeNewEvent({ calendarId: calendar.id, title: 'Team sync' }));
  await store.createEvent(
    makeNewEvent({
      calendarId: calendar.id,
      title: 'Dentist',
      start: '2026-10-15T10:00',
      end: '2026-10-15T11:00',
    }),
  );
  db.close();
}

const open = () =>
  render(<App create={() => createDb(dbName)} now={NOW} storage={memoryStorage()} />);

const TODAY = 'Tuesday, October 13, 2026';
const THURSDAY = 'Thursday, October 15, 2026';

describe('the month on a phone (D-059)', () => {
  it('lists the chosen day under the grid, and touching a day chooses it without leaving', async () => {
    phone(true);
    await seed();
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Month' }));

    const today = await screen.findByRole('region', { name: TODAY });
    expect(within(today).getByRole('button', { name: /Team sync/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: TODAY }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: THURSDAY }));
    const thursday = await screen.findByRole('region', { name: THURSDAY });
    expect(within(thursday).getByRole('button', { name: /Dentist/ })).toBeTruthy();
    expect(within(thursday).queryByRole('button', { name: /Team sync/ })).toBeNull();
    expect(screen.getByRole('button', { name: THURSDAY }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Month' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('opens the event card from the list', async () => {
    phone(true);
    await seed();
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Month' }));
    const list = await screen.findByRole('region', { name: TODAY });
    fireEvent.click(within(list).getByRole('button', { name: /Team sync/ }));
    expect(await screen.findByRole('dialog', { name: 'Team sync' })).toBeTruthy();
  });

  it('on a wide screen a touched day still opens the day view, with no list', async () => {
    phone(false);
    await seed();
    open();
    await screen.findByRole('heading', { level: 1, name: 'October 2026' });
    expect(screen.queryByRole('region', { name: TODAY })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: THURSDAY }));
    expect((await screen.findByRole('button', { name: 'Day' })).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.queryByRole('region', { name: THURSDAY })).toBeNull();
  });

  it('on a phone a swipe up or down on the grid pages through months (D-075)', async () => {
    phone(true);
    await seed();
    const { container } = open();
    // A phone opens on the Today list; the month is one touch away.
    fireEvent.click(await screen.findByRole('button', { name: 'Month' }));
    await screen.findByRole('heading', { level: 1, name: 'October 2026' });
    const grid = container.querySelector('.month') as HTMLElement;
    expect(grid.getAttribute('data-paging')).toBe('true');
    const swipe = (dy: number, dx = 0) => {
      fireEvent.touchStart(grid, { touches: [{ clientX: 200, clientY: 300 }] });
      fireEvent.touchEnd(grid, { changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }] });
    };
    const title = () => screen.getByRole('heading', { level: 1 }).textContent;
    swipe(-120);
    expect(title()).toBe('November 2026');
    swipe(40); // too short
    expect(title()).toBe('November 2026');
    swipe(100, 90); // slanted: not a paging swipe
    expect(title()).toBe('November 2026');
    swipe(120);
    swipe(120);
    expect(title()).toBe('September 2026');
  });

  it('on a wide screen the grid does not page by touch', async () => {
    phone(false);
    await seed();
    const { container } = open();
    await screen.findByRole('heading', { level: 1, name: 'October 2026' });
    expect(container.querySelector('.month')?.getAttribute('data-paging')).toBeNull();
  });
});
