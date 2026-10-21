import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { createDb } from '@/data';
import { SETTINGS_KEY } from '@/features/settings';

afterEach(cleanup);

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
});
