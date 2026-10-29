import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { createDb, createStore } from '@/data';

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
  dbName = `quick-${Math.random().toString(36).slice(2)}`;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function seed() {
  const db = createDb(dbName);
  const store = createStore(db);
  await store.createCalendar({ name: 'Personal', color: 'blue' });
  await store.createCalendar({ name: 'Work', color: 'green' });
  db.close();
}

const open = () =>
  render(<App create={() => createDb(dbName)} now={NOW} storage={memoryStorage()} />);

/** The day view, with its all-day strip, and a tap on it. */
async function tapStrip() {
  const view = open();
  await screen.findByRole('button', { name: 'Add event' });
  fireEvent.keyDown(window, { code: 'KeyD' });
  await waitFor(() => expect(view.container.querySelector('.tg-allday-cell')).toBeTruthy());
  fireEvent.click(view.container.querySelector('.tg-allday-cell') as HTMLElement);
  return screen.findByRole('dialog', { name: 'Quick add' });
}

describe('the quick card on a wide screen (D-071)', () => {
  it('opens beside the tap when the tap says where it was (D-073)', async () => {
    await seed();
    const view = open();
    await screen.findByRole('button', { name: 'Add event' });
    fireEvent.keyDown(window, { code: 'KeyD' });
    await waitFor(() => expect(view.container.querySelector('.tg-allday-cell')).toBeTruthy());
    fireEvent.click(view.container.querySelector('.tg-allday-cell') as HTMLElement, {
      clientX: 400,
      clientY: 90,
    });
    const card = await screen.findByRole('dialog', { name: 'Quick add' });
    expect(card.getAttribute('data-placed')).toBe('true');
    expect(card.closest('.modal-backdrop')?.classList.contains('quick-anchored')).toBe(true);
  });

  it('opens with the title ready, says when, and Enter saves an event on that day', async () => {
    await seed();
    const card = await tapStrip();
    const title = within(card).getByLabelText('Title');
    expect(title).toBe(document.activeElement);
    expect(card.textContent).toContain('October 13, 2026');
    fireEvent.change(title, { target: { value: 'Holiday' } });
    fireEvent.submit(title.closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByRole('button', { name: /Holiday/ })).toBeTruthy();
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('will not save without a title, and "More options" carries what was typed', async () => {
    await seed();
    const card = await tapStrip();
    const save = within(card).getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(card).getByLabelText('Title'), { target: { value: 'Trip' } });
    expect(save.disabled).toBe(false);
    fireEvent.change(within(card).getByRole('combobox'), {
      target: { value: within(card).getByRole('option', { name: 'Work' }).getAttribute('value') },
    });
    fireEvent.click(within(card).getByRole('button', { name: 'More options' }));
    const editor = await screen.findByRole('dialog', { name: 'New event' });
    expect((within(editor).getByLabelText('Title') as HTMLInputElement).value).toBe('Trip');
    const calendar = within(editor).getByLabelText('Calendar') as HTMLSelectElement;
    expect(calendar.selectedOptions[0]?.text).toBe('Work');
    expect(screen.queryByRole('dialog', { name: 'Quick add' })).toBeNull();
  });

  it('Escape closes it and creates nothing', async () => {
    await seed();
    const card = await tapStrip();
    fireEvent.change(within(card).getByLabelText('Title'), { target: { value: 'Nope' } });
    fireEvent.keyDown(card, { code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: /Nope/ })).toBeNull();
  });

  it('the Back button closes it, and shortcuts pause while it is open', async () => {
    await seed();
    await tapStrip();
    fireEvent.keyDown(window, { code: 'KeyW' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Tuesday, October 13, 2026');
    window.history.back();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('the + button still opens the full editor', async () => {
    await seed();
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Add event' }));
    expect(await screen.findByRole('dialog', { name: 'New event' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Quick add' })).toBeNull();
  });

  it('on a phone a tap goes straight to the full editor', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width: 599px'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    await seed();
    const view = open();
    await screen.findByRole('button', { name: 'Add event' });
    fireEvent.click(screen.getByRole('button', { name: 'Day' }));
    await waitFor(() => expect(view.container.querySelector('.tg-allday-cell')).toBeTruthy());
    fireEvent.click(view.container.querySelector('.tg-allday-cell') as HTMLElement);
    expect(await screen.findByRole('dialog', { name: 'New event' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Quick add' })).toBeNull();
  });
});
