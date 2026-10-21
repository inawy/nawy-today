import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { createDb, createStore } from '@/data';
import { makeNewEvent } from '../helpers/factories';

const NOW = () => Date.UTC(2026, 9, 13, 12, 0);
const storage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

let dbName = '';
beforeEach(() => {
  dbName = `cal-${Math.random().toString(36).slice(2)}`;
});
afterEach(cleanup);

const open = () => render(<App create={() => createDb(dbName)} now={NOW} storage={storage()} />);

async function seed(names: string[]): Promise<string[]> {
  const db = createDb(dbName);
  const store = createStore(db);
  const ids: string[] = [];
  for (const name of names) ids.push((await store.createCalendar({ name, color: 'blue' })).id);
  const first = ids[0];
  if (first) await store.createEvent(makeNewEvent({ calendarId: first, title: 'Team sync' }));
  db.close();
  return ids;
}

describe('calendar management', () => {
  it('adds a calendar with a name and a colour', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Add calendar' }));
    const dialog = await screen.findByRole('dialog', { name: 'New calendar' });
    fireEvent.change(within(dialog).getByLabelText('Calendar name'), {
      target: { value: '  Study  ' },
    });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Green' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Study')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('accepts a custom colour and keeps it on the calendar', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Add calendar' }));
    const dialog = await screen.findByRole('dialog', { name: 'New calendar' });
    fireEvent.change(within(dialog).getByLabelText('Calendar name'), { target: { value: 'Mine' } });
    fireEvent.change(within(dialog).getByLabelText('Custom color'), {
      target: { value: '#12ab34' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    const dot = (await screen.findByText('Mine')).parentElement?.querySelector('.calendar-dot');
    expect((dot as HTMLElement).style.background).toMatch(/#12ab34|rgb\(18, 171, 52\)/);
  });

  it('refuses an empty name and says why', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Add calendar' }));
    const dialog = await screen.findByRole('dialog', { name: 'New calendar' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'New calendar' })).toBeTruthy();
  });

  it('renames a calendar', async () => {
    await seed(['Personal', 'Work']);
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit calendar: Work' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit calendar' });
    fireEvent.change(within(dialog).getByLabelText('Calendar name'), {
      target: { value: 'Office' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Office')).toBeTruthy();
    expect(screen.queryByText('Work')).toBeNull();
  });

  it('deletes a calendar with its events only after a confirmation', async () => {
    await seed(['Personal', 'Work']);
    open();
    expect(await screen.findByText('Team sync')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit calendar: Personal' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit calendar' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete calendar' }));
    expect(within(dialog).getByText(/deletes the calendar and all its events/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, delete the calendar' }));
    await waitFor(() => expect(screen.queryByText('Team sync')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Edit calendar: Personal' })).toBeNull();
  });

  it('does not allow deleting the last calendar', async () => {
    await seed(['Only']);
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit calendar: Only' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit calendar' });
    expect(within(dialog).queryByRole('button', { name: 'Delete calendar' })).toBeNull();
    expect(within(dialog).getByText('The last calendar cannot be deleted.')).toBeTruthy();
  });
});
