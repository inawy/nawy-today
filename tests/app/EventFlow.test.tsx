import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { createDb, createStore } from '@/data';
import type { NawyDb } from '@/data';
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
  dbName = `flow-${Math.random().toString(36).slice(2)}`;
});
afterEach(cleanup);

async function seed(extra: (store: ReturnType<typeof createStore>, calendarId: string) => Promise<void>) {
  const db = createDb(dbName);
  const store = createStore(db);
  const calendar = await store.createCalendar({ name: 'Personal', color: 'blue' });
  await extra(store, calendar.id);
  db.close();
}

const open = (create: () => NawyDb = () => createDb(dbName)) =>
  render(<App create={create} now={NOW} storage={memoryStorage()} />);

const bars = (name: RegExp) => screen.queryAllByRole('button', { name });
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('create', () => {
  it('first use: makes the one calendar needed, saves the event and shows it', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Add event' }));
    const dialog = await screen.findByRole('dialog', { name: 'New event' });
    type('Title', 'Lunch');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByRole('button', { name: /Lunch/ })).toBeTruthy();
    expect(screen.getByText('Personal')).toBeTruthy(); // the calendar that was created
  });

  it('the C key opens the editor, and shortcuts pause while it is open', async () => {
    open();
    await screen.findByRole('button', { name: 'Add event' });
    fireEvent.keyDown(window, { code: 'KeyC' });
    await screen.findByRole('dialog', { name: 'New event' });
    fireEvent.keyDown(window, { code: 'KeyW' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('October 2026');
  });

  it('closing with Escape saves what was typed', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Add event' }));
    const dialog = await screen.findByRole('dialog', { name: 'New event' });
    type('Title', 'Dentist');
    fireEvent.keyDown(dialog, { code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByRole('button', { name: /Dentist/ })).toBeTruthy();
  });

  it('closing an untouched new event saves nothing', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Add event' }));
    const dialog = await screen.findByRole('dialog', { name: 'New event' });
    fireEvent.keyDown(dialog, { code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(bars(/./).filter((b) => b.classList.contains('bar'))).toHaveLength(0);
  });
});

describe('edit and delete', () => {
  it('edits a plain event and deletes it with a 5 second undo', async () => {
    await seed(async (store, calendarId) => {
      await store.createEvent(makeNewEvent({ calendarId, title: 'Team sync' }));
    });
    open();
    fireEvent.click(await screen.findByRole('button', { name: /Team sync/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit event' });
    type('Title', 'Team sync 2');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByRole('button', { name: /Team sync 2/ });

    fireEvent.click(screen.getByRole('button', { name: /Team sync 2/ }));
    const again = await screen.findByRole('dialog', { name: 'Edit event' });
    fireEvent.click(within(again).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(bars(/Team sync/)).toHaveLength(0));
    const toast = await screen.findByText('Event deleted');
    expect(toast).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('button', { name: /Team sync 2/ })).toBeTruthy();
  });

  it('refuses an end before the start and keeps the form open with the reason', async () => {
    await seed(async (store, calendarId) => {
      await store.createEvent(makeNewEvent({ calendarId, title: 'Team sync' }));
    });
    open();
    fireEvent.click(await screen.findByRole('button', { name: /Team sync/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit event' });
    fireEvent.change(within(dialog).getByLabelText('Ends · Time'), { target: { value: '07:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('The end is before the start.');
    expect(screen.getByRole('dialog', { name: 'Edit event' })).toBeTruthy();
  });
});

describe('repeating events', () => {
  const seedSeries = () =>
    seed(async (store, calendarId) => {
      await store.createEvent(
        makeNewEvent({ calendarId, title: 'Standup', rrule: 'FREQ=DAILY;COUNT=5' }),
      );
    });

  it('"this event only" changes one day and leaves the rest', async () => {
    await seedSeries();
    open();
    await screen.findAllByRole('button', { name: /Standup/ });
    expect(bars(/Standup/)).toHaveLength(5);
    fireEvent.click(bars(/Standup/)[2] as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: 'Edit event' });
    type('Title', 'Standup (moved)');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    const ask = await screen.findByRole('dialog', { name: 'Edit repeating event' });
    fireEvent.click(within(ask).getByRole('button', { name: 'Save' })); // default: this event
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(bars(/Standup \(moved\)/)).toHaveLength(1));
    expect(bars(/^(?!.*moved).*Standup/)).toHaveLength(4);
  });

  it('"all events" renames the whole series', async () => {
    await seedSeries();
    open();
    await screen.findAllByRole('button', { name: /Standup/ });
    fireEvent.click(bars(/Standup/)[0] as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: 'Edit event' });
    type('Title', 'Daily');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    const ask = await screen.findByRole('dialog', { name: 'Edit repeating event' });
    fireEvent.click(within(ask).getByLabelText('All events'));
    fireEvent.click(within(ask).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(bars(/Daily/)).toHaveLength(5));
    expect(bars(/Standup/)).toHaveLength(0);
  });

  it('cancelling the scope question keeps the editor open and changes nothing', async () => {
    await seedSeries();
    open();
    await screen.findAllByRole('button', { name: /Standup/ });
    fireEvent.click(bars(/Standup/)[1] as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: 'Edit event' });
    type('Title', 'Nope');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    const ask = await screen.findByRole('dialog', { name: 'Edit repeating event' });
    fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit repeating event' })).toBeNull());
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Nope');
    expect(bars(/Nope/).filter((b) => b.classList.contains('bar'))).toHaveLength(0);
  });

  it('deleting this and following keeps the earlier days, and undo brings them back', async () => {
    await seedSeries();
    open();
    await screen.findAllByRole('button', { name: /Standup/ });
    fireEvent.click(bars(/Standup/)[2] as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: 'Edit event' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    const ask = await screen.findByRole('dialog', { name: 'Delete repeating event' });
    fireEvent.click(within(ask).getByLabelText('This and following events'));
    fireEvent.click(within(ask).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(bars(/Standup/)).toHaveLength(2));
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(bars(/Standup/)).toHaveLength(5));
  });
});

describe('when saving fails', () => {
  it('keeps everything typed, says why, and succeeds when retried', async () => {
    await seed(async (store, calendarId) => {
      await store.createEvent(makeNewEvent({ calendarId, title: 'Team sync' }));
    });
    let failing = false;
    const create = () => {
      const db = createDb(dbName);
      const original = db.transaction.bind(db) as (...args: unknown[]) => Promise<unknown>;
      (db as unknown as { transaction: unknown }).transaction = (...args: unknown[]) =>
        failing ? Promise.reject(new DOMException('full', 'QuotaExceededError')) : original(...args);
      return db;
    };
    open(create);
    fireEvent.click(await screen.findByRole('button', { name: /Team sync/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit event' });
    type('Title', 'Renamed');
    failing = true;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/Could not save/);
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Renamed');

    failing = false;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByRole('button', { name: /Renamed/ })).toBeTruthy();
  });
});
