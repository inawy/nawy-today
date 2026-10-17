import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { createDb, createStore } from '@/data';
import type { NawyDb } from '@/data';
import { SETTINGS_KEY } from '@/features/settings';
import { makeNewAllDayEvent, makeNewEvent } from '../helpers/factories';

const NOW = () => Date.UTC(2026, 9, 13, 12, 0); // Tue 13 Oct 2026

const memoryStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    raw: m,
  };
};

let dbName = '';
beforeEach(() => {
  dbName = `app-${Math.random().toString(36).slice(2)}`;
});
afterEach(cleanup);

async function seed(): Promise<{ calendarId: string; db: NawyDb }> {
  const db = createDb(dbName);
  const store = createStore(db);
  const calendar = await store.createCalendar({ name: 'Personal', color: 'blue' });
  await store.createEvent(makeNewEvent({ calendarId: calendar.id, title: 'Team sync' }));
  await store.createEvent(
    makeNewAllDayEvent({
      calendarId: calendar.id,
      title: 'Trip',
      start: '2026-10-20',
      end: '2026-10-23',
    }),
  );
  db.close();
  return { calendarId: calendar.id, db };
}

const open = (storage = memoryStorage(), create = () => createDb(dbName)) =>
  render(<App create={create} now={NOW} storage={storage} />);

describe('app: first screen', () => {
  it('opens on the current month with an honest empty state, never a blank page', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'October 2026' })).toBeTruthy();
    expect(screen.getByText('No calendars yet.')).toBeTruthy();
    expect(screen.getByText('13').getAttribute('aria-current')).toBe('date');
  });

  it('shows stored events as bars on their days', async () => {
    await seed();
    open();
    expect(await screen.findByText('Team sync')).toBeTruthy();
    expect(screen.getByText('Trip')).toBeTruthy();
    expect(screen.getByText('Personal')).toBeTruthy();
  });
});

describe('app: navigation', () => {
  it('moves between months and returns to today', async () => {
    open();
    const title = () => screen.getByRole('heading', { level: 1 }).textContent;
    await screen.findByRole('heading', { level: 1, name: 'October 2026' });
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(title()).toBe('November 2026');
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(title()).toBe('September 2026');
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(title()).toBe('October 2026');
  });
});

describe('app: language and theme', () => {
  it('switching to Arabic flips the document to RTL and is remembered', async () => {
    const storage = memoryStorage();
    open(storage);
    await screen.findByRole('heading', { level: 1 });
    expect([document.documentElement.lang, document.documentElement.dir]).toEqual(['en', 'ltr']);

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'ar' } });
    await waitFor(() => expect(document.documentElement.dir).toBe('rtl'));
    expect(document.documentElement.lang).toBe('ar');
    expect(screen.getByRole('button', { name: 'اليوم' })).toBeTruthy();
    expect(JSON.parse(storage.raw.get(SETTINGS_KEY) ?? '{}')).toMatchObject({
      locale: 'ar',
      weekStart: 6,
    });
  });

  it('applies an explicit theme to the document', async () => {
    open();
    await screen.findByRole('heading', { level: 1 });
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'dark' } });
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'));
  });

  it('says so when the browser will not keep the settings', async () => {
    const refusing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    open(refusing as never);
    await screen.findByRole('heading', { level: 1 });
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'light' } });
    expect(await screen.findByText(/apply to this session only/)).toBeTruthy();
  });
});

describe('app: drawer', () => {
  it('opens with focus inside, and Escape closes it and returns focus to the menu button', async () => {
    open();
    await screen.findByRole('heading', { level: 1 });
    const menu = screen.getByRole('button', { name: 'Menu' });
    fireEvent.click(menu);
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    const close = screen.getByRole('button', { name: 'Close menu' });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(close, { code: 'Escape' });
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menu);
  });
});

describe('app: calendars', () => {
  it('hides and shows a calendar’s events from the sidebar', async () => {
    await seed();
    open();
    await screen.findByText('Team sync');
    const checkbox = screen.getByRole('checkbox', { name: /Personal/ });
    fireEvent.click(checkbox);
    await waitFor(() => expect(screen.queryByText('Team sync')).toBeNull());
    fireEvent.click(checkbox);
    expect(await screen.findByText('Team sync')).toBeTruthy();
  });
});

describe('app: failures are contained (Phase 5 gate)', () => {
  it('shows a recovery screen with a retry when the database cannot be opened', async () => {
    const broken = () =>
      ({
        open: () => Promise.reject(new Error('blocked')),
        close: () => undefined,
      }) as unknown as NawyDb;
    open(memoryStorage(), broken);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText("Couldn't open your data on this device.")).toBeTruthy();
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('leaves damaged stored records out, says how many, and still shows the rest', async () => {
    const { calendarId } = await seed();
    const db = createDb(dbName);
    await db.events.put({ id: 'bad-1', calendarId, title: 42 } as never);
    await db.events.put({ id: 'bad-2', calendarId, title: 'x', allDay: 'yes' } as never);
    db.close();
    open();
    expect(await screen.findByText('Team sync')).toBeTruthy();
    expect(screen.getByText(/2 damaged record\(s\) were left out/)).toBeTruthy();
    expect(screen.getByText(/Nothing was deleted/)).toBeTruthy();
  });

  it('reports an event whose rule the engine does not support, and still shows it', async () => {
    const { calendarId } = await seed();
    const db = createDb(dbName);
    const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = makeEvent();
    await createStore(db).createEvent({
      ...rest,
      calendarId,
      title: 'Odd rule',
      rrule: 'FREQ=HOURLY',
    });
    db.close();
    open();
    expect(await screen.findByText('Odd rule')).toBeTruthy();
    expect(screen.getByText(/unsupported rule/)).toBeTruthy();
  });
});
