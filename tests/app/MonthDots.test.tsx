import 'fake-indexeddb/auto';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { createDb, createStore } from '@/data';
import { makeNewEvent } from '../helpers/factories';

afterEach(cleanup);

describe('month dots (the phone overview)', () => {
  it('draw one dot per event on a day, never more than three, and stay out of the reading order', async () => {
    const name = `dots-${Math.random().toString(36).slice(2)}`;
    const db = createDb(name);
    const store = createStore(db);
    const calendar = await store.createCalendar({ name: 'Personal', color: 'blue' });
    for (const title of ['A', 'B', 'C', 'D', 'E']) {
      await store.createEvent(makeNewEvent({ calendarId: calendar.id, title }));
    }
    db.close();
    const m = new Map<string, string>();
    render(
      <App
        create={() => createDb(name)}
        now={() => Date.UTC(2026, 9, 13, 12)}
        storage={{
          getItem: (k) => m.get(k) ?? null,
          setItem: (k, v) => void m.set(k, v),
        }}
      />,
    );
    await screen.findByText('A');
    const withDots = [...document.querySelectorAll('.dots')];
    expect(withDots).toHaveLength(1);
    const dots = withDots[0] as HTMLElement;
    expect(dots.getAttribute('aria-hidden')).toBe('true');
    expect(dots.querySelectorAll('.dot')).toHaveLength(3);
  });
});
