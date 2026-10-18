import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { createDb, createStore } from '@/data';
import { makeNewAllDayEvent, makeNewEvent } from '../helpers/factories';

const NOW = () => Date.UTC(2026, 9, 13, 12, 0); // Tue 13 Oct 2026, 12:00 UTC

const memoryStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

let dbName = '';
beforeEach(() => {
  dbName = `agenda-${Math.random().toString(36).slice(2)}`;
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
    makeNewAllDayEvent({
      calendarId: calendar.id,
      title: 'Holiday',
      start: '2026-10-13',
      end: '2026-10-14',
    }),
  );
  db.close();
}

const open = () =>
  render(<App create={() => createDb(dbName)} now={NOW} storage={memoryStorage()} />);

describe('Today (agenda) view', () => {
  it('opens on a narrow screen with today as a list, all-day first, with a now marker', async () => {
    phone(true);
    await seed();
    open();
    const pressed = await screen.findByRole('button', { name: 'Agenda' });
    expect(pressed.getAttribute('aria-pressed')).toBe('true');
    const items = await screen.findAllByRole('button', { name: /Holiday|Team sync/ });
    expect(items[0]?.textContent).toContain('Holiday');
    expect(screen.getByTestId('agenda-now')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Tuesday, October 13, 2026');
  });

  it('opens on the month on a wide screen, and the A key switches to the list', async () => {
    phone(false);
    await seed();
    open();
    const heading = await screen.findByRole('heading', { level: 1, name: 'October 2026' });
    expect(heading).toBeTruthy();
    fireEvent.keyDown(window, { code: 'KeyA' });
    expect(
      (await screen.findByRole('button', { name: 'Agenda' })).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('previous/next move one day and an empty day says so', async () => {
    phone(true);
    open();
    await screen.findByRole('button', { name: 'Agenda' });
    fireEvent.click(await screen.findByRole('button', { name: 'Next day' }));
    expect(await screen.findByText('No events on this day.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Wednesday, October 14, 2026',
    );
  });

  it('tapping an item opens the editor, and Back saves and closes it', async () => {
    phone(true);
    await seed();
    open();
    fireEvent.click(await screen.findByRole('button', { name: /Team sync/ }));
    await screen.findByRole('dialog', { name: 'Edit event' });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renamed by back' } });
    window.history.back();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByRole('button', { name: /Renamed by back/ })).toBeTruthy();
  });

  it('Back with an invalid form keeps the editor open and keeps what was typed', async () => {
    phone(true);
    await seed();
    open();
    fireEvent.click(await screen.findByRole('button', { name: /Team sync/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit event' });
    fireEvent.change(within(dialog).getByLabelText('Ends · Time'), { target: { value: '07:00' } });
    window.history.back();
    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'The end is before the start.',
    );
    expect(screen.getByRole('dialog', { name: 'Edit event' })).toBeTruthy();
    // Back still works afterwards: fix the form, press Back again.
    fireEvent.change(within(dialog).getByLabelText('Ends · Time'), { target: { value: '23:00' } });
    window.history.back();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
