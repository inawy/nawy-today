import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { createDb, createStore } from '@/data';
import { makeNewEvent } from '../helpers/factories';

const NOW = () => Date.UTC(2026, 9, 13, 12, 0);

const memoryStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

let dbName = '';
beforeEach(() => {
  dbName = `search-${Math.random().toString(36).slice(2)}`;
});
afterEach(cleanup);

async function seed() {
  const db = createDb(dbName);
  const store = createStore(db);
  const calendar = await store.createCalendar({ name: 'Personal', color: 'blue' });
  const base = { calendarId: calendar.id };
  await store.createEvent(makeNewEvent({ ...base, title: 'اجتماع المدرسة' }));
  await store.createEvent(
    makeNewEvent({
      ...base,
      title: 'Dentist',
      start: '2026-12-01T10:00',
      end: '2026-12-01T11:00',
      location: 'Clinic 5',
    }),
  );
  await store.createEvent(
    makeNewEvent({
      ...base,
      title: 'Dentist follow-up',
      start: '2026-10-20T10:00',
      end: '2026-10-20T11:00',
    }),
  );
  db.close();
}

const open = () =>
  render(<App create={() => createDb(dbName)} now={NOW} storage={memoryStorage()} />);

const openSearch = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Search' }));
  return screen.findByRole('dialog', { name: 'Search' });
};
const type = (value: string) =>
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), { target: { value } });

describe('search', () => {
  it('shows a hint first, then live results nearest to today first', async () => {
    await seed();
    open();
    const dialog = await openSearch();
    expect(within(dialog).getByText('Type one or more words.')).toBeTruthy();
    type('dentist');
    const items = await within(dialog).findAllByRole('button', { name: /Dentist/ });
    expect(items.map((i) => i.querySelector('.search-title')?.textContent)).toEqual([
      'Dentist follow-up',
      'Dentist',
    ]);
    expect(within(dialog).getByText('2 result(s)')).toBeTruthy();
    expect(within(dialog).getByText('Clinic 5')).toBeTruthy();
  });

  it('finds Arabic text written with different hamza, ta marbuta and diacritics', async () => {
    await seed();
    open();
    const dialog = await openSearch();
    type('المَدرسه');
    expect(await within(dialog).findByRole('button', { name: /اجتماع المدرسة/ })).toBeTruthy();
  });

  it('says so when nothing matches', async () => {
    await seed();
    open();
    const dialog = await openSearch();
    type('zzzz');
    expect(await within(dialog).findByText('No results.')).toBeTruthy();
  });

  it('picking a result opens that event in the editor', async () => {
    await seed();
    open();
    const dialog = await openSearch();
    type('follow');
    fireEvent.click(await within(dialog).findByRole('button', { name: /Dentist follow-up/ }));
    const editor = await screen.findByRole('dialog', { name: 'Edit event' });
    expect((within(editor).getByLabelText('Title') as HTMLInputElement).value).toBe(
      'Dentist follow-up',
    );
    expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull();
  });

  it('Enter opens the first result', async () => {
    await seed();
    open();
    await openSearch();
    type('dentist');
    await screen.findAllByRole('button', { name: /Dentist/ });
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search' }), { code: 'Enter' });
    const editor = await screen.findByRole('dialog', { name: 'Edit event' });
    expect((within(editor).getByLabelText('Title') as HTMLInputElement).value).toBe(
      'Dentist follow-up',
    );
  });

  it('the / key opens it, Escape closes it, and shortcuts pause meanwhile', async () => {
    await seed();
    open();
    await screen.findByRole('button', { name: 'Search' });
    fireEvent.keyDown(window, { code: 'Slash' });
    const dialog = await screen.findByRole('dialog', { name: 'Search' });
    fireEvent.keyDown(window, { code: 'KeyW' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('October 2026');
    fireEvent.keyDown(dialog, { code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('the Back button closes it', async () => {
    await seed();
    open();
    await openSearch();
    window.history.back();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('offers the queries that led to an opened event, and can clear them', async () => {
    await seed();
    open();
    let dialog = await openSearch();
    expect(within(dialog).queryByText('Recent searches')).toBeNull();
    type('follow');
    fireEvent.click(await within(dialog).findByRole('button', { name: /Dentist follow-up/ }));
    fireEvent.keyDown(await screen.findByRole('dialog', { name: 'Edit event' }), {
      code: 'Escape',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    dialog = await openSearch();
    expect(within(dialog).getByText('Recent searches')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'follow' }));
    expect((screen.getByRole('searchbox', { name: 'Search' }) as HTMLInputElement).value).toBe(
      'follow',
    );
    expect(await within(dialog).findByRole('button', { name: /Dentist follow-up/ })).toBeTruthy();
    expect(within(dialog).queryByText('Recent searches')).toBeNull();

    type('');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Clear' }));
    expect(within(dialog).queryByText('Recent searches')).toBeNull();
  });

  it('does not remember a query that opened nothing', async () => {
    await seed();
    open();
    let dialog = await openSearch();
    type('zzzz');
    await within(dialog).findByText('No results.');
    fireEvent.keyDown(dialog, { code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    dialog = await openSearch();
    expect(within(dialog).queryByText('Recent searches')).toBeNull();
  });
});
