import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildMonthModel } from '@/features/month';
import type { MonthModel } from '@/features/month';
import { SettingsProvider, defaultSettings } from '@/features/settings';
import { MonthView } from '@/ui/month/MonthView';
import { makeCalendar, makeEvent } from '../helpers/factories';

afterEach(() => {
  cleanup();
  opened.length = 0;
});

const storage = (locale: 'ar' | 'en', extra: object = {}) => ({
  getItem: () => JSON.stringify({ ...defaultSettings(locale), ...extra }),
  setItem: () => undefined,
});

function model(events: unknown[], maxLanes = 3): MonthModel {
  return buildMonthModel({
    calendars: [makeCalendar()],
    events,
    year: 2026,
    month: 10,
    weekStart: 6,
    maxLanes,
  });
}

const opened: string[] = [];
const openedEvents: string[] = [];
const view = (m: MonthModel, locale: 'ar' | 'en' = 'en', extra: object = {}) =>
  render(
    <SettingsProvider storage={storage(locale, extra)} languages={[locale]}>
      <MonthView
        model={m}
        today="2026-10-13"
        lanes={3}
        onOpenDay={(d) => opened.push(d)}
        onOpenEvent={(o) => openedEvents.push(o.event.id)}
      />
    </SettingsProvider>,
  );

describe('MonthView', () => {
  it('draws 42 day cells with the weekday header in the chosen week order', () => {
    const { container } = view(model([]));
    expect(container.querySelectorAll('.day')).toHaveLength(42);
    const names = [...container.querySelectorAll('.month-weekdays span')].map((n) => n.textContent);
    expect(names).toEqual(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  });

  it('marks today and dims days of the neighbouring months', () => {
    const { container } = view(model([]));
    expect(container.querySelectorAll('[data-today="true"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-outside="true"]').length).toBeGreaterThan(0);
  });

  it('shows the time of a single-day timed event, in 24 h when asked', () => {
    view(
      model([makeEvent({ title: 'Standup', start: '2026-10-13T14:05', end: '2026-10-13T14:35' })]),
      'en',
      {
        hour12: false,
      },
    );
    expect(screen.getByText('14:05')).toBeTruthy();
  });

  it('writes the overflow label with Arabic-Indic digits when chosen', () => {
    const events = ['a', 'b', 'c', 'd', 'e'].map((id) => makeEvent({ id, title: id }));
    const { container } = view(model(events), 'ar', { numerals: 'arab' });
    expect(container.querySelector('.more')?.textContent).toBe('+٣ أخرى');
  });

  it('puts an untitled event under a readable name', () => {
    view(model([makeEvent({ title: '   ' })]));
    expect(screen.getByText('(untitled)')).toBeTruthy();
  });

  it('renders text as text, never as markup', () => {
    const { container } = view(model([makeEvent({ title: '<img src=x onerror=alert(1)>' })]));
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  });

  it('one event that cannot be drawn does not take the grid down with it', () => {
    const m = model([
      makeEvent({ id: 'ok', title: 'Fine' }),
      makeEvent({ id: 'bad', title: 'Broken', start: '2026-10-14T09:00', end: '2026-10-14T10:00' }),
    ]);
    const bad = m.weeks.flatMap((w) => w.bars).find((b) => b.occurrence.event.id === 'bad');
    // Simulate a record that slipped through with the wrong shape at render time.
    (bad?.occurrence.event as { title: unknown }).title = { not: 'a string' };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    view(m);
    expect(screen.getByText('Fine')).toBeTruthy();
    expect(screen.getByText("Couldn't show this event")).toBeTruthy();
    spy.mockRestore();
  });

  it('opens a day from its number, and marks today for assistive technology', () => {
    view(model([]));
    fireEvent.click(screen.getByRole('button', { name: 'Wednesday, October 14, 2026' }));
    expect(opened).toEqual(['2026-10-14']);
    expect(
      screen
        .getByRole('button', { name: 'Tuesday, October 13, 2026' })
        .getAttribute('aria-current'),
    ).toBe('date');
  });

  it('opens that day from its "+N" too', () => {
    const events = ['a', 'b', 'c', 'd', 'e'].map((id) => makeEvent({ id, title: id }));
    view(model(events));
    fireEvent.click(screen.getByRole('button', { name: /^\+3 more, Tuesday, October 13, 2026$/ }));
    expect(opened).toEqual(['2026-10-13']);
  });

  it('opens an event for editing when its bar is clicked', () => {
    openedEvents.length = 0;
    view(model([makeEvent({ id: 'ev-9', title: 'Standup' })]));
    fireEvent.click(screen.getByRole('button', { name: /Standup/ }));
    expect(openedEvents).toEqual(['ev-9']);
  });
});
