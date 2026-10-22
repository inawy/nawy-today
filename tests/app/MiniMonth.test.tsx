import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { createDb } from '@/data';

afterEach(cleanup);

const open = () => {
  const m = new Map<string, string>();
  const storage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
  const name = `mini-${Math.random().toString(36).slice(2)}`;
  return render(
    <App create={() => createDb(name)} now={() => Date.UTC(2026, 9, 13, 12)} storage={storage} />,
  );
};

describe('the small month in the sidebar', () => {
  it('jumps the main view to a picked date', async () => {
    open();
    const mini = (await screen.findAllByRole('region', { name: 'October 2026' }))[0];
    expect(mini).toBeTruthy();
    fireEvent.click(within(mini as HTMLElement).getByRole('button', { name: /^21, / }));
    expect(
      screen.getAllByRole('button', { name: /^21, / }).some((b) => b.dataset['selected'] === 'true'),
    ).toBe(true);
  });

  it('browses other months without moving the main view', async () => {
    open();
    const mini = (await screen.findAllByRole('region', { name: 'October 2026' }))[0] as HTMLElement;
    fireEvent.click(within(mini).getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('region', { name: 'November 2026' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('October 2026');
  });
});
