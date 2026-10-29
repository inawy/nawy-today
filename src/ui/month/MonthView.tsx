import { useRef } from 'react';
import type { TouchEvent } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { ErrorBoundary } from '@/lib/ErrorBoundary';
import { useRefocus } from '@/lib/useRefocus';
import {
  formatDate,
  formatDayOfMonth,
  formatHijriDate,
  formatHijriDay,
  formatTime,
  formatWeekday,
} from '@/core/time';
import type { FormatOptions, PlainDate, TimeFormatOptions } from '@/core/time';
import type { Occurrence } from '@/core/recurrence';
import type { MonthBar, MonthModel, WeekModel } from '@/features/month';
import { useT } from '@/features/i18n';
import { useSettings } from '@/features/settings';
import { keyAction } from '@/features/timegrid';
import { verticalSwipeIntent } from '@/features/view';
import type { SwipeIntent } from '@/features/view';
import type { DragDelta } from '@/features/timegrid';
import { calendarColorVars } from '@/ui/theme/calendarColor';
import { useBlockDrag } from '../timegrid/useBlockDrag';

export interface MonthViewProps {
  readonly model: MonthModel;
  readonly today: PlainDate;
  /** Lanes under each day number (matches the `maxLanes` the model was built with). */
  readonly lanes: number;
  /** Opens the day view for a date (day number or its "+N"). */
  readonly onOpenDay: (date: PlainDate) => void;
  /** Opens an event for editing. */
  readonly onOpenEvent: (occurrence: Occurrence) => void;
  /**
   * On a phone: the chosen day, shown with a ring. Touching a day then chooses it (the list of
   * its events sits under the grid) instead of leaving the month (D-059).
   */
  readonly selected?: PlainDate | undefined;
  /**
   * On a phone: a quick swipe up or down on the grid pages to the next or previous month (D-075).
   * The grid then keeps vertical touches for itself; the list under it still scrolls.
   */
  readonly onPage?: ((intent: Exclude<SwipeIntent, null>) => void) | undefined;
  /** An item was dragged (or moved with Shift + arrows) by whole days: weeks count as 7 days. */
  readonly onMoveEvent?: ((occurrence: Occurrence, delta: DragDelta) => void) | undefined;
}

type Vars = CSSProperties & Record<`--${string}`, string | number>;

export function MonthView({
  model,
  today,
  lanes,
  onOpenDay,
  onOpenEvent,
  onMoveEvent,
  onPage,
  selected,
}: MonthViewProps) {
  const t = useT();
  const { settings } = useSettings();
  const fmt: FormatOptions = { locale: settings.locale, numerals: settings.numerals };
  const timeFmt: TimeFormatOptions = { ...fmt, hour12: settings.hour12 };
  const header = model.weeks[0]?.days ?? [];
  const { rootRef, remember } = useRefocus();
  const touch = useRef<{ x: number; y: number; at: number } | null>(null);
  const paging = onPage
    ? {
        onTouchStart: (e: TouchEvent) => {
          const t0 = e.touches.length === 1 ? e.touches[0] : undefined;
          touch.current = t0 ? { x: t0.clientX, y: t0.clientY, at: e.timeStamp } : null;
        },
        onTouchEnd: (e: TouchEvent) => {
          const from = touch.current;
          const t1 = e.changedTouches[0];
          touch.current = null;
          if (!from || !t1) return;
          const intent = verticalSwipeIntent({
            dx: t1.clientX - from.x,
            dy: t1.clientY - from.y,
            ms: e.timeStamp - from.at,
          });
          if (intent) onPage(intent);
        },
      }
    : {};

  return (
    <div
      className="month"
      ref={rootRef}
      style={{ '--lanes': lanes } as Vars}
      data-paging={onPage ? 'true' : undefined}
      {...paging}
    >
      <div className="month-weekdays" aria-hidden="true">
        {header.map((d) => (
          <span key={d}>{formatWeekday(d, fmt, 'short')}</span>
        ))}
      </div>
      {model.weeks.map((week) => (
        <WeekRow
          key={week.days[0]}
          week={week}
          month={model.month}
          today={today}
          lanes={lanes}
          selected={selected}
          fmt={fmt}
          timeFmt={timeFmt}
          hijri={settings.hijri}
          onOpenDay={onOpenDay}
          onOpenEvent={onOpenEvent}
          onMoveEvent={onMoveEvent}
          onKeyboardEdit={remember}
          moreLabel={(count) => t('moreEvents', { count: formatCount(count, fmt) })}
        />
      ))}
    </div>
  );
}

function formatCount(n: number, fmt: FormatOptions): string {
  return new Intl.NumberFormat(fmt.locale, { numberingSystem: fmt.numerals ?? 'latn' }).format(n);
}

interface WeekRowProps {
  readonly week: WeekModel;
  readonly month: number;
  readonly today: PlainDate;
  readonly lanes: number;
  readonly selected: PlainDate | undefined;
  readonly fmt: FormatOptions;
  readonly timeFmt: TimeFormatOptions;
  /** Show the Hijri day under each day number (display only). */
  readonly hijri: boolean;
  readonly onOpenDay: (date: PlainDate) => void;
  readonly onOpenEvent: (occurrence: Occurrence) => void;
  readonly onMoveEvent?: ((occurrence: Occurrence, delta: DragDelta) => void) | undefined;
  readonly onKeyboardEdit: (eventId: string) => void;
  readonly moreLabel: (count: number) => string;
}

function WeekRow({
  week,
  month,
  today,
  lanes,
  selected,
  fmt,
  timeFmt,
  hijri,
  onOpenDay,
  onOpenEvent,
  onMoveEvent,
  onKeyboardEdit,
  moreLabel,
}: WeekRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  return (
    <div className="week" ref={rowRef}>
      {week.days.map((day, col) => {
        const inMonth = Number(day.slice(5, 7)) === month;
        return (
          <div
            key={day}
            className="day"
            data-outside={inMonth ? undefined : 'true'}
            data-today={day === today ? 'true' : undefined}
            data-selected={day === selected ? 'true' : undefined}
            style={{ gridColumn: col + 1 } as Vars}
          >
            <button
              type="button"
              className="day-btn"
              aria-label={
                hijri
                  ? `${formatDate(day, fmt, 'full')} · ${formatHijriDate(day, fmt)}`
                  : formatDate(day, fmt, 'full')
              }
              aria-current={day === today ? 'date' : undefined}
              aria-pressed={selected === undefined ? undefined : day === selected}
              onClick={() => onOpenDay(day)}
            >
              <time className="day-number" dateTime={day}>
                {formatDayOfMonth(day, fmt)}
              </time>
              {hijri && (
                <span className="hijri-num" aria-hidden="true">
                  {formatHijriDay(day, fmt)}
                </span>
              )}
            </button>
            <Dots week={week} col={col} />
          </div>
        );
      })}
      {week.days.map((day, col) => {
        const hidden = week.hidden[col] ?? 0;
        return hidden > 0 ? (
          <button
            key={`more-${day}`}
            type="button"
            className="more"
            style={{ gridColumn: col + 1, gridRow: lanes + 1 } as Vars}
            aria-label={`${moreLabel(hidden)}, ${formatDate(day, fmt, 'full')}`}
            onClick={() => onOpenDay(day)}
          >
            {moreLabel(hidden)}
          </button>
        ) : null;
      })}
      {week.bars.map((bar) => (
        <ErrorBoundary key={bar.occurrence.key} fallback={() => <FailedBar bar={bar} />}>
          <EventBar
            bar={bar}
            timeFmt={timeFmt}
            onOpen={onOpenEvent}
            rowRef={rowRef}
            onMove={onMoveEvent}
            onKeyboardEdit={onKeyboardEdit}
          />
        </ErrorBoundary>
      ))}
    </div>
  );
}

const MAX_DOTS = 3;

/** On a phone a day shows up to three dots, one per event in its calendar's colour (see CSS). */
function Dots({ week, col }: { readonly week: WeekModel; readonly col: number }) {
  const colors = week.bars
    .filter((bar) => bar.startCol <= col && col <= bar.endCol)
    .map((bar) => calendarColorVars(bar.calendarColor).bar);
  const hidden = week.hidden[col] ?? 0;
  const all = [...colors, ...Array.from({ length: hidden }, () => 'var(--text-muted)')];
  if (all.length === 0) return null;
  return (
    <span className="dots" aria-hidden="true">
      {all.slice(0, MAX_DOTS).map((color, i) => (
        <span key={i} className="dot" style={{ background: color }} />
      ))}
    </span>
  );
}

function barStyle(bar: MonthBar): Vars {
  const color = calendarColorVars(bar.calendarColor);
  return {
    gridColumn: `${bar.startCol + 1} / ${bar.endCol + 2}`,
    gridRow: bar.lane + 2,
    '--bar': color.bar,
    '--bar-bg': color.bg,
  };
}

function EventBar({
  bar,
  timeFmt,
  onOpen,
  rowRef,
  onMove,
  onKeyboardEdit,
}: {
  readonly bar: MonthBar;
  readonly timeFmt: TimeFormatOptions;
  readonly onOpen: (occurrence: Occurrence) => void;
  readonly rowRef: RefObject<HTMLElement | null>;
  readonly onMove?: ((occurrence: Occurrence, delta: DragDelta) => void) | undefined;
  readonly onKeyboardEdit: (eventId: string) => void;
}) {
  const t = useT();
  const { event, start } = bar.occurrence;
  const title = event.title.trim() === '' ? t('untitled') : event.title;
  // Sideways moves days, up and down move whole weeks; times of day never change (D-049).
  const drag = useBlockDrag({
    hourPx: 1,
    columns: 7,
    gridRef: rowRef,
    weeks: true,
    onMove: (delta) => onMove?.(bar.occurrence, { days: delta.days, minutes: 0 }),
  });
  const style: Vars = {
    ...barStyle(bar),
    ...(drag.offset && { transform: `translate(${drag.offset.x}px, ${drag.offset.y}px)` }),
  };
  return (
    <button
      type="button"
      className="bar"
      style={style}
      data-dragging={drag.offset ? 'true' : undefined}
      data-event-id={event.id}
      aria-keyshortcuts={
        onMove ? 'Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight' : undefined
      }
      onKeyDown={(e) => {
        if (!onMove || e.target !== e.currentTarget) return;
        const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
        const action = keyAction(
          e.code,
          { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey },
          rtl,
        );
        if (action?.kind !== 'move') return;
        // In the month, up/down is a week earlier or later.
        const days = action.days !== 0 ? action.days : action.minutes < 0 ? -7 : 7;
        e.preventDefault();
        onKeyboardEdit(event.id);
        onMove(bar.occurrence, { days, minutes: 0 });
      }}
      data-open-start={bar.continuesBefore ? 'true' : undefined}
      data-open-end={bar.continuesAfter ? 'true' : undefined}
      title={title}
      onClick={() => {
        if (!drag.consumeClick()) onOpen(bar.occurrence);
      }}
      {...(onMove ? drag.handlers : {})}
    >
      {bar.showTime && <span className="bar-time">{formatTime(start, timeFmt)}</span>}
      <span className="bar-title">{title}</span>
    </button>
  );
}

function FailedBar({ bar }: { readonly bar: MonthBar }) {
  const t = useT();
  return (
    <div className="bar bar-failed" style={barStyle(bar)}>
      {t('eventFailed')}
    </div>
  );
}
