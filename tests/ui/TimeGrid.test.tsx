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
    onOpenEvent?: (id: string) => void;
    onCreateAt?: (date: string, time: string) => void;
    onCreateAllDay?: (date: string) => void;
    onPoint?: (point: { x: number; y: number } | undefined) => void;
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
        onOpenEvent={(o) => props.onOpenEvent?.(o.event.id)}
        onCreateAt={(d, tm, p) => {
          props.onCreateAt?.(d, tm);
          props.onPoint?.(p);
        }}
        onCreateAllDay={
          props.onCreateAllDay
            ? (d, p) => {
                props.onCreateAllDay?.(d);
                props.onPoint?.(p);
              }
            : undefined
        }
      />
    </SettingsProvider>,
  );

describe('TimeGrid resize edge', () => {
  const onResize = vi.fn();
  const withHandle = (events: unknown[], props: object = {}) =>
    render(
      <SettingsProvider storage={storage('en')} languages={['en']}>
        <TimeGrid
          model={model(events)}
          today="2026-10-13"
          nowLocal="2026-10-13T12:00"
          lanes={3}
          onOpenEvent={() => undefined}
          onCreateAt={() => undefined}
          {...props}
        />
      </SettingsProvider>,
    );

  it('gives a block a bottom edge only when resizing is available', () => {
    const events = [makeEvent({ id: 'a', title: 'A' })];
    const without = withHandle(events);
    expect(without.container.querySelector('.block-resize')).toBeNull();
    cleanup();
    const withIt = withHandle(events, { onResizeEvent: onResize });
    expect(withIt.container.querySelectorAll('.block-resize')).toHaveLength(1);
  });

  it('has no edge where the real end is on a later day', () => {
    const { container } = withHandle(
      [
        makeEvent({
          id: 'night',
          title: 'Night',
          start: '2026-10-13T22:00',
          end: '2026-10-14T02:00',
        }),
      ],
      { onResizeEvent: onResize },
    );
    // The part on the 13th ends at midnight (no edge); the part on the 14th has one.
    expect(container.querySelectorAll('.block-resize')).toHaveLength(1);
  });
});

describe('TimeGrid keyboard editing', () => {
  const press = (el: Element, init: KeyboardEventInit) =>
    fireEvent.keyDown(el, { bubbles: true, ...init });
  const setup = () => {
    const onMove = vi.fn();
    const onResize = vi.fn();
    const r = render(
      <SettingsProvider storage={storage('en')} languages={['en']}>
        <TimeGrid
          model={model([makeEvent({ id: 'a', title: 'A' })])}
          today="2026-10-13"
          nowLocal="2026-10-13T12:00"
          lanes={3}
          onOpenEvent={() => undefined}
          onCreateAt={() => undefined}
          onMoveEvent={onMove}
          onResizeEvent={onResize}
        />
      </SettingsProvider>,
    );
    const block = r.container.querySelector('.block') as HTMLElement;
    return { block, onMove, onResize };
  };

  it('moves a focused block with Shift + arrows', () => {
    const { block, onMove, onResize } = setup();
    press(block, { code: 'ArrowDown', shiftKey: true });
    expect(onMove).toHaveBeenLastCalledWith(expect.anything(), { days: 0, minutes: 15 });
    press(block, { code: 'ArrowRight', shiftKey: true });
    expect(onMove).toHaveBeenLastCalledWith(expect.anything(), { days: 1, minutes: 0 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it('changes only the end with Ctrl + Shift + up/down', () => {
    const { block, onMove, onResize } = setup();
    press(block, { code: 'ArrowDown', shiftKey: true, ctrlKey: true });
    expect(onResize).toHaveBeenCalledWith(expect.anything(), 15);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('does nothing for a plain arrow, and announces its keys', () => {
    const { block, onMove, onResize } = setup();
    press(block, { code: 'ArrowDown' });
    expect(onMove).not.toHaveBeenCalled();
    expect(onResize).not.toHaveBeenCalled();
    expect(block.getAttribute('aria-keyshortcuts')).toContain('Shift+ArrowDown');
  });
});

describe('TimeGrid all-day items', () => {
  const setup = () => {
    const onMove = vi.fn();
    const r = render(
      <SettingsProvider storage={storage('en')} languages={['en']}>
        <TimeGrid
          model={model([makeAllDayEvent({ id: 'h', title: 'Holiday' })])}
          today="2026-10-13"
          nowLocal="2026-10-13T12:00"
          lanes={3}
          onOpenEvent={() => undefined}
          onCreateAt={() => undefined}
          onMoveEvent={onMove}
        />
      </SettingsProvider>,
    );
    return { bar: r.container.querySelector('.tg-allday .bar') as HTMLElement, onMove };
  };

  it('moves by whole days with Shift + left/right, never by minutes', () => {
    const { bar, onMove } = setup();
    fireEvent.keyDown(bar, { code: 'ArrowRight', shiftKey: true });
    expect(onMove).toHaveBeenLastCalledWith(expect.anything(), { days: 1, minutes: 0 });
    fireEvent.keyDown(bar, { code: 'ArrowLeft', shiftKey: true });
    expect(onMove).toHaveBeenLastCalledWith(expect.anything(), { days: -1, minutes: 0 });
    fireEvent.keyDown(bar, { code: 'ArrowDown', shiftKey: true });
    fireEvent.keyDown(bar, { code: 'ArrowRight' });
    expect(onMove).toHaveBeenCalledTimes(2);
  });

  it('announces only the keys it answers to', () => {
    const { bar } = setup();
    expect(bar.getAttribute('aria-keyshortcuts')).toBe('Shift+ArrowLeft Shift+ArrowRight');
  });
});

describe('TimeGrid short blocks', () => {
  it('marks events under 40px (about 50 minutes) so title and time share a line', () => {
    const { container } = view(
      model([
        makeEvent({
          id: 'short',
          title: 'Short',
          start: '2026-10-13T09:00',
          end: '2026-10-13T09:30',
        }),
        makeEvent({
          id: 'long',
          title: 'Long',
          start: '2026-10-13T11:00',
          end: '2026-10-13T13:00',
        }),
      ]),
    );
    const blocks = [...container.querySelectorAll('.block')];
    const flag = (name: string) =>
      blocks.find((b) => b.textContent?.startsWith(name))?.getAttribute('data-short');
    expect(flag('Short')).toBe('true');
    expect(flag('Long')).toBeNull();
  });
});

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
    fireEvent.click(screen.getByRole('button', { name: /^Wed 14, Wednesday, October 14, 2026$/ }));
    expect(opened).toEqual(['2026-10-14']);
    expect(
      screen
        .getByRole('button', { name: /^Tue 13, Tuesday, October 13, 2026$/ })
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

  it('opens an event when its block is clicked, without starting a new event', () => {
    const onOpenEvent = vi.fn();
    const onCreateAt = vi.fn();
    view(model([makeEvent({ id: 'ev-3', title: 'Standup' })]), { onOpenEvent, onCreateAt });
    fireEvent.click(screen.getByRole('button', { name: /Standup/ }));
    expect(onOpenEvent).toHaveBeenCalledWith('ev-3');
    expect(onCreateAt).not.toHaveBeenCalled();
  });

  it('a click on an empty spot of a day starts an event on the nearest half hour', () => {
    const onCreateAt = vi.fn();
    const { container } = view(model([]), { onCreateAt });
    const col = container.querySelectorAll<HTMLElement>('.tg-col')[1] as HTMLElement;
    col.getBoundingClientRect = () => ({ top: 0, height: 2400 }) as DOMRect;
    fireEvent.click(col, { clientY: 1000 + 10 }); // 10:00 is at 1000px; +10px is still inside the 10:00 half hour
    expect(onCreateAt).toHaveBeenCalledWith('2026-10-13', '10:00');
    fireEvent.click(col, { clientY: 1000 + 60 });
    expect(onCreateAt).toHaveBeenLastCalledWith('2026-10-13', '10:30');
  });

  it('tells where the tap landed, so a card can open beside it', () => {
    const onPoint = vi.fn();
    const { container } = view(model([]), { onPoint, onCreateAllDay: () => undefined });
    const col = container.querySelectorAll<HTMLElement>('.tg-col')[1] as HTMLElement;
    col.getBoundingClientRect = () => ({ top: 0, height: 2400 }) as DOMRect;
    fireEvent.click(col, { clientX: 300, clientY: 1010 });
    expect(onPoint).toHaveBeenLastCalledWith({ x: 300, y: 1010 });
    fireEvent.click(container.querySelectorAll<HTMLElement>('.tg-allday-cell')[0] as HTMLElement, {
      clientX: 120,
      clientY: 40,
    });
    expect(onPoint).toHaveBeenLastCalledWith({ x: 120, y: 40 });
  });

  it('a touch on an empty spot of the all-day strip starts an all-day event on that day', () => {
    const onCreateAllDay = vi.fn();
    const { container } = view(model([]), { onCreateAllDay });
    const cells = container.querySelectorAll<HTMLElement>('.tg-allday-cell');
    fireEvent.click(cells[2] as HTMLElement);
    expect(onCreateAllDay).toHaveBeenCalledWith('2026-10-14');
    expect(cells[0]?.getAttribute('data-create')).toBe('true');
  });

  it('without a handler the strip is not offered as something to touch', () => {
    const { container } = view(model([]));
    expect(container.querySelector('.tg-allday-cell')?.getAttribute('data-create')).toBeNull();
  });
});

describe('TimeGrid: going to now (D-077)', () => {
  const grid = (jump: number) => (
    <SettingsProvider storage={storage('en')} languages={['en']}>
      <TimeGrid
        model={model([])}
        today="2026-10-13"
        nowLocal="2026-10-13T14:20"
        lanes={3}
        jumpToNow={jump}
        onOpenEvent={() => undefined}
        onCreateAt={() => undefined}
      />
    </SettingsProvider>
  );

  it('scrolls smoothly to an hour before now when asked, and not when it first opens', () => {
    const scrollTo = vi.fn();
    const original = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrollTo as unknown as typeof original;
    try {
      const { rerender } = render(grid(0));
      expect(scrollTo).not.toHaveBeenCalled();
      rerender(grid(0));
      expect(scrollTo).not.toHaveBeenCalled();
      rerender(grid(1));
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo).toHaveBeenCalledWith({ top: 13 * 48, behavior: 'smooth' });
      rerender(grid(2));
      expect(scrollTo).toHaveBeenCalledTimes(2);
    } finally {
      HTMLElement.prototype.scrollTo = original;
    }
  });
});
