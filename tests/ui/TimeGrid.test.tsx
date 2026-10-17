import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTimeGridModel } from '@/features/timegrid';
import type { TimeGridModel } from '@/features/timegrid';
import { SettingsProvider, defaultSettings } from '@/features/settings';
import { TimeGrid } from '@/ui/timegrid/TimeGrid';
import { makeAllDayEvent, makeCalendar, makeEvent } from '../helpers/factories';

afterEach(cleanup);

const WEEK = [
  '2026-10-12',
  '2026-10-13',
  '2026-10-14',
  '2026-10-15',
  '2026-10-16',
  '2026-10-17',
  '2026-10-18',
];

const storage = (locale: 'ar' | 'en', extra: object = {}) => ({
  getItem: () => JSON.stringify({ ...defaultSettings(locale), hour12: false, ...extra }),
  setItem: () => undefined,
});

const model = (events: unknown[], days: string[] = WEEK): TimeGridModel =>
  buildTimeGridModel({ calendars: [makeCalendar()], events, days, maxAllDayLanes: 3 });

const view = (
  m: TimeGridModel,
  props: {
    onOpenDay?: (d: string) => void;
    now?: string;
    locale?: 'ar' | 'en';
    extra?: object;
  } = {},
) =>
  render(
    <SettingsProvider
      storage={storage(props.locale ?? 'en', props.extra)}
      languages={[props.locale ?? 'en']}
    >
      <TimeGrid
        model={m}
        today="2026-10-13"
        nowLocal={props.now ?? '2026-10-13T12:00'}
        lanes={3}
        onOpenDay={props.onOpenDay}
      />
    </SettingsProvider>,
  );

describe('TimeGrid', () => {
  it('draws a column and a header per day, and 23 hour labels', () => {
    const { container } = view(model([]));
    expect(container.querySelectorAll('.tg-col')).toHaveLength(7);
    expect(container.querySelectorAll('.tg-headcell')).toHaveLength(7);
    expect(container.querySelectorAll('.tg-hour')).toHaveLength(23);
    expect(screen.getByText('13:00')).toBeTruthy();
    expect(screen.getByText('All day')).toBeTruthy();
  });

  it('shows the hours in 12-hour form when chosen', () => {
    view(model([]), { extra: { hour12: true } });
    expect(screen.getByText('1:00 PM')).toBeTruthy();
  });

  it('puts the now line only in today’s column, at the right height', () => {
    const { container } = view(model([]), { now: '2026-10-13T18:00' });
    const lines = screen.getAllByTestId('now-line');
    expect(lines).toHaveLength(1);
    expect((lines[0] as HTMLElement).style.insetBlockStart).toBe('75%');
    expect(lines[0]?.closest('.tg-col')?.getAttribute('data-today')).toBe('true');
    expect(container.querySelectorAll('[data-today="true"]').length).toBeGreaterThan(0);
  });

  it('has no now line when today is not among the shown days', () => {
    view(model([], ['2026-10-20']), { now: '2026-10-13T12:00' });
    expect(screen.queryByTestId('now-line')).toBeNull();
  });

  it('positions and sizes a block from the model', () => {
    const { container } = view(model([makeEvent({ title: 'Sync' })]));
    const block = container.querySelector('.block') as HTMLElement;
    expect(block.style.insetBlockStart).toBe('37.5%'); // 09:00
    expect(block.style.insetInlineStart).toBe('0%');
    expect(block.style.inlineSize).toBe('100%');
    expect(screen.getByText('Sync')).toBeTruthy();
    expect(screen.getByText('09:00 – 10:00')).toBeTruthy();
  });

  it('splits the width between overlapping blocks', () => {
    const events = [
      makeEvent({ id: 'a', title: 'A', start: '2026-10-13T09:00', end: '2026-10-13T11:00' }),
      makeEvent({ id: 'b', title: 'B', start: '2026-10-13T10:00', end: '2026-10-13T12:00' }),
    ];
    const { container } = view(model(events));
    const [a, b] = [...container.querySelectorAll<HTMLElement>('.block')];
    expect(a?.style.inlineSize).toBe('50%');
    expect(b?.style.insetInlineStart).toBe('50%');
  });

  it('draws all-day events as bars in their own row, with "+N" when crowded', () => {
    const events = ['a', 'b', 'c', 'd'].map((id) =>
      makeAllDayEvent({ id, title: id, start: '2026-10-14', end: '2026-10-15' }),
    );
    const { container } = view(model(events));
    expect(container.querySelectorAll('.tg-allday .bar')).toHaveLength(2);
    expect(container.querySelector('.tg-allday .more')?.textContent).toBe('+2 more');
  });

  it('makes day headers buttons only when an opener is given', () => {
    view(model([]));
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    cleanup();
    const opened: string[] = [];
    view(model([]), { onOpenDay: (d) => opened.push(d) });
    fireEvent.click(screen.getByRole('button', { name: 'Wednesday, October 14, 2026' }));
    expect(opened).toEqual(['2026-10-14']);
    expect(
      screen
        .getByRole('button', { name: 'Tuesday, October 13, 2026' })
        .getAttribute('aria-current'),
    ).toBe('date');
  });

  it('renders text as text, never as markup', () => {
    const { container } = view(model([makeEvent({ title: '<img src=x onerror=alert(1)>' })]));
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  });

  it('one block that cannot be drawn does not take the grid down with it', () => {
    const m = model([
      makeEvent({ id: 'ok', title: 'Fine' }),
      makeEvent({ id: 'bad', title: 'Broken', start: '2026-10-14T09:00', end: '2026-10-14T10:00' }),
    ]);
    const bad = m.days.flatMap((d) => d.blocks).find((b) => b.occurrence.event.id === 'bad');
    (bad?.occurrence.event as { title: unknown }).title = { not: 'a string' };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    view(m);
    expect(screen.getByText('Fine')).toBeTruthy();
    expect(screen.getByText("Couldn't show this event")).toBeTruthy();
    spy.mockRestore();
  });

  it('draws in Arabic with Arabic-Indic digits when chosen', () => {
    view(model([]), { locale: 'ar', extra: { numerals: 'arab' } });
    expect(screen.getByText('طوال اليوم')).toBeTruthy();
    expect(screen.getByText(/١٣\D*٠٠/)).toBeTruthy();
  });
});
