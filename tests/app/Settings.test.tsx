import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { createDb } from '@/data';
import { SETTINGS_KEY } from '@/features/settings';

afterEach(cleanup);

const memory = (initial?: Record<string, unknown>) => {
  const m = new Map<string, string>();
  if (initial) m.set(SETTINGS_KEY, JSON.stringify(initial));
  return {
    m,
    storage: {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    },
  };
};

describe('display settings', () => {
  it('week start, time format and numerals are changeable and remembered', async () => {
    const m = new Map<string, string>();
    const storage = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
    const name = `set-${Math.random().toString(36).slice(2)}`;
    render(
      <App create={() => createDb(name)} now={() => Date.UTC(2026, 9, 13, 12)} storage={storage} />,
    );
    fireEvent.change(await screen.findByLabelText('Week starts on'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Time format'), { target: { value: '24' } });
    fireEvent.change(screen.getByLabelText('Numerals'), { target: { value: 'arab' } });
    const saved = JSON.parse(m.get(SETTINGS_KEY) ?? '{}') as Record<string, unknown>;
    expect(saved).toMatchObject({ weekStart: 7, hour12: false, numerals: 'arab' });
  });

  it('shows the Hijri month under the title only when asked', async () => {
    const m = new Map<string, string>();
    const storage = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
    const name = `hij-${Math.random().toString(36).slice(2)}`;
    render(
      <App create={() => createDb(name)} now={() => Date.UTC(2026, 9, 13, 12)} storage={storage} />,
    );
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('October 2026');
    fireEvent.click(screen.getByLabelText('Show Hijri date'));
    expect(heading.textContent).toContain('1448');
    expect(heading.textContent).toContain('October 2026');
  });
});

describe('the view the app opens on (D-054)', () => {
  const open = (storage: ReturnType<typeof memory>['storage']) =>
    render(
      <App
        create={() => createDb(`dv-${Math.random().toString(36).slice(2)}`)}
        now={() => Date.UTC(2026, 9, 13, 12)}
        storage={storage}
      />,
    );

  it('is remembered when changed', async () => {
    const { m, storage } = memory();
    open(storage);
    fireEvent.change(await screen.findByLabelText('View when the app opens'), {
      target: { value: 'week' },
    });
    expect(JSON.parse(m.get(SETTINGS_KEY) ?? '{}')).toMatchObject({ defaultView: 'week' });
  });

  it('opens on the chosen view, and on the month when nothing was chosen', async () => {
    const chosen = memory({ locale: 'en', defaultView: 'week' });
    const first = open(chosen.storage);
    expect((await screen.findAllByRole('button', { name: 'Week', pressed: true })).length).toBe(1);
    first.unmount();
    open(memory({ locale: 'en' }).storage);
    expect((await screen.findAllByRole('button', { name: 'Month', pressed: true })).length).toBe(1);
  });
});
