import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
  dbName = `year-${Math.random().toString(36).slice(2)}`;
});
afterEach(cleanup);

async function seed() {
  const db = createDb(dbName);
  const store = createStore(db);
  const calendar = await store.createCalendar({ name: 'Personal', color: 'blue' });
  await store.createEvent(makeNewEvent({ calendarId: calendar.id, title: 'Team sync' }));
  db.close();
}

const open = () =>
  render(<App create={() => createDb(dbName)} now={NOW} storage={memoryStorage()} />);

const heading = () => screen.getByRole('heading', { level: 1 }).textContent;

describe('the year view (D-069)', () => {
  it('shows twelve months, marks days that have events, and the Y key opens it', async () => {
    await seed();
    open();
    await screen.findByRole('heading', { level: 1, name: 'October 2026' });
    fireEvent.keyDown(window, { code: 'KeyY' });
    expect(heading()).toBe('2026');
    expect(screen.getByRole('button', { name: 'Year' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByRole('region').length).toBeGreaterThanOrEqual(12);
    const october = screen.getByRole('region', { name: 'October 2026' });
    const busy = await within(october).findByRole('button', {
      name: 'Tuesday, October 13, 2026, 1 event(s)',
    });
    expect(busy.getAttribute('data-busy')).toBe('some');
    expect(busy.getAttribute('data-today')).toBe('true');
    const quiet = within(october).getByRole('button', { name: 'Wednesday, October 14, 2026' });
    expect(quiet.getAttribute('data-busy')).toBeNull();
  });

  it('touching a day opens it, and touching a month name opens that month', async () => {
    await seed();
    open();
    await screen.findByRole('heading', { level: 1, name: 'October 2026' });
    fireEvent.click(screen.getByRole('button', { name: 'Year' }));
    const october = screen.getByRole('region', { name: 'October 2026' });
    fireEvent.click(await within(october).findByRole('button', { name: /October 13, 2026/ }));
    expect(heading()).toBe('Tuesday, October 13, 2026');

    fireEvent.keyDown(window, { code: 'KeyY' });
    fireEvent.click(screen.getByRole('button', { name: 'March 2026' }));
    expect(heading()).toBe('March 2026');
    expect(screen.getByRole('button', { name: 'Month' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('moves a whole year with the arrows and returns with Today', async () => {
    await seed();
    open();
    await screen.findByRole('heading', { level: 1, name: 'October 2026' });
    fireEvent.keyDown(window, { code: 'KeyY' });
    fireEvent.click(screen.getByRole('button', { name: 'Next year' }));
    expect(heading()).toBe('2027');
    fireEvent.click(screen.getByRole('button', { name: 'Previous year' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous year' }));
    expect(heading()).toBe('2025');
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(heading()).toBe('2026');
  });

  it('has one tab stop for the whole year and arrow keys move between days', async () => {
    await seed();
    open();
    await screen.findByRole('heading', { level: 1, name: 'October 2026' });
    fireEvent.keyDown(window, { code: 'KeyY' });
    const stops = document.querySelectorAll('.year-day[tabindex="0"]');
    expect(stops).toHaveLength(1);
    expect((stops[0] as HTMLElement).dataset['day']).toBe('2026-10-13');
    (stops[0] as HTMLElement).focus();
    fireEvent.keyDown(stops[0] as HTMLElement, { code: 'ArrowDown' });
    expect((document.activeElement as HTMLElement).dataset['day']).toBe('2026-10-20');
  });
});
