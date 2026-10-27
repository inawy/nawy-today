import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { nowPosition } from '@/core/layout';
import type { Occurrence } from '@/core/recurrence';
import { formatDate, formatDayOfMonth, formatTime, formatWeekday } from '@/core/time';
import type { FormatOptions, PlainDate, PlainDateTime, TimeFormatOptions } from '@/core/time';
import { useT } from '@/features/i18n';
import { useSettings } from '@/features/settings';
import { keyAction } from '@/features/timegrid';
import type { AllDayBar, DragDelta, TimeGridModel, TimedBlock } from '@/features/timegrid';
import { useRefocus } from '@/lib/useRefocus';
import { ErrorBoundary } from '@/lib/ErrorBoundary';
import { calendarColorVars } from '@/ui/theme/calendarColor';
import { useBlockDrag } from './useBlockDrag';

/** Height of one hour in the grid, in CSS pixels. */
export const HOUR_PX = 48;
/** Below this height a block cannot stack title over time, so they share one line. */
const SHORT_BLOCK_PX = 40;

export interface TimeGridProps {
  readonly model: TimeGridModel;
  readonly today: PlainDate;
  readonly nowLocal: PlainDateTime;
  /** All-day rows drawn before "+N" (matches the model's `maxAllDayLanes`). */
  readonly lanes: number;
  /** In the week view a day header opens that day; the day view passes nothing. */
  readonly onOpenDay?: ((date: PlainDate) => void) | undefined;
  /** Opens an event for editing. */
  readonly onOpenEvent: (occurrence: Occurrence) => void;
  /** Clicking an empty spot of a day starts a new event there (`time` is `HH:mm`, on the half hour). */
  readonly onCreateAt: (date: PlainDate, time: string) => void;
  /** Touching an empty spot of the all-day strip starts an all-day event on that day (D-061). */
  readonly onCreateAllDay?: ((date: PlainDate) => void) | undefined;
  /** A block was dragged somewhere else: move this occurrence by that many days/minutes. */
  readonly onMoveEvent?: ((occurrence: Occurrence, delta: DragDelta) => void) | undefined;
  /** The bottom edge of a block was dragged: move this occurrence's end by that many minutes. */
  readonly onResizeEvent?: ((occurrence: Occurrence, minutes: number) => void) | undefined;
}

type Vars = CSSProperties & Record<`--${string}`, string | number>;

const pad = (n: number): string => String(n).padStart(2, '0');

export function TimeGrid({
  model,
  today,
  nowLocal,
  lanes,
  onOpenDay,
  onOpenEvent,
  onCreateAt,
  onCreateAllDay,
  onMoveEvent,
  onResizeEvent,
}: TimeGridProps) {
  const t = useT();
  const { settings } = useSettings();
  const fmt: FormatOptions = { locale: settings.locale, numerals: settings.numerals };
  const timeFmt: TimeFormatOptions = { ...fmt, hour12: settings.hour12 };
  const count = model.days.length;
  // The all-day strip is only as tall as its busiest day (plus the "+N" row when something is cut).
  const anyHidden = model.allDay.hidden.some((n) => n > 0);
  const allDayRows = anyHidden
    ? lanes
    : Math.max(1, ...model.allDay.bars.map((bar) => bar.lane + 1));

  // Open near the working day: an hour before "now" when today is shown, otherwise 07:00.
  const [firstHour] = useState(() =>
    model.days.some((d) => d.date === today) ? Math.max(0, Number(nowLocal.slice(11, 13)) - 1) : 7,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const cellsRef = useRef<HTMLDivElement>(null);
  const allDayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = firstHour * HOUR_PX;
  }, [firstHour]);

  const { rootRef, remember } = useRefocus();

  return (
    <div
      className="tg"
      data-cols={count}
      ref={rootRef}
      style={{ '--cols': count, '--hour-h': `${HOUR_PX}px`, '--lanes': allDayRows } as Vars}
    >
      <div className="tg-row tg-head">
        <div className="tg-gutter" />
        <div className="tg-cells">
          {model.days.map((d) => {
            const weekday = formatWeekday(d.date, fmt, 'short');
            const dayNumber = formatDayOfMonth(d.date, fmt);
            // The accessible name starts with the visible text ("Mon 19", WCAG 2.5.3) and then
            // adds the full date.
            const label = `${weekday} ${dayNumber}, ${formatDate(d.date, fmt, 'full')}`;
            const content = (
              <>
                <span className="tg-weekday">{weekday}</span>{' '}
                <span className="tg-daynum">{dayNumber}</span>
              </>
            );
            return onOpenDay ? (
              <button
                key={d.date}
                type="button"
                className="tg-headcell"
                data-today={d.date === today ? 'true' : undefined}
                aria-label={label}
                aria-current={d.date === today ? 'date' : undefined}
                onClick={() => onOpenDay(d.date)}
              >
                {content}
              </button>
            ) : (
              <div
                key={d.date}
                className="tg-headcell"
                data-today={d.date === today ? 'true' : undefined}
                aria-current={d.date === today ? 'date' : undefined}
              >
                {content}
              </div>
            );
          })}
        </div>
      </div>

      <div className="tg-row tg-allday">
        <div className="tg-gutter tg-allday-label">{t('allDay')}</div>
        <div className="tg-allday-grid" ref={allDayRef}>
          {model.days.map((d, i) => (
            <div
              key={d.date}
              className="tg-allday-cell"
              data-create={onCreateAllDay ? 'true' : undefined}
              style={{ gridColumn: i + 1 } as Vars}
              onClick={onCreateAllDay ? () => onCreateAllDay(d.date) : undefined}
            />
          ))}
          {model.allDay.hidden.map((n, i) =>
            n > 0 ? (
              <span
                key={`more-${model.days[i]?.date ?? i}`}
                className="more"
                style={{ gridColumn: i + 1, gridRow: allDayRows } as Vars}
              >
                {t('moreEvents', {
                  count: new Intl.NumberFormat(fmt.locale, {
                    numberingSystem: fmt.numerals ?? 'latn',
                  }).format(n),
                })}
              </span>
            ) : null,
          )}
          {model.allDay.bars.map((bar) => (
            <ErrorBoundary key={bar.occurrence.key} fallback={() => <FailedAllDay bar={bar} />}>
              <AllDayItem
                bar={bar}
                onOpen={onOpenEvent}
                gridRef={allDayRef}
                columns={count}
                onMove={onMoveEvent}
                onKeyboardEdit={remember}
              />
            </ErrorBoundary>
          ))}
        </div>
      </div>

      <div className="tg-scroll" ref={scrollRef}>
        <div className="tg-body">
          <div className="tg-gutter tg-hours" aria-hidden="true">
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <span key={h} className="tg-hour" style={{ insetBlockStart: `${(h / 24) * 100}%` }}>
                {formatTime(`2000-01-01T${pad(h)}:00`, timeFmt)}
              </span>
            ))}
          </div>
          <div className="tg-cells tg-cols" ref={cellsRef}>
            {model.days.map((d) => {
              const now = nowPosition(nowLocal, d.date);
              return (
                <div
                  key={d.date}
                  className="tg-col"
                  data-today={d.date === today ? 'true' : undefined}
                  onClick={(e) => {
                    // Only a click on the empty column itself, never on an event inside it.
                    if (e.target !== e.currentTarget) return;
                    const box = e.currentTarget.getBoundingClientRect();
                    if (box.height <= 0) return;
                    const half = Math.min(
                      47,
                      Math.floor(((e.clientY - box.top) / box.height) * 48),
                    );
                    onCreateAt(
                      d.date,
                      `${pad(Math.floor(half / 2))}:${half % 2 === 0 ? '00' : '30'}`,
                    );
                  }}
                >
                  {d.blocks.map((block) => (
                    <ErrorBoundary key={block.key} fallback={() => <FailedBlock block={block} />}>
                      <Block
                        block={block}
                        timeFmt={timeFmt}
                        onOpen={onOpenEvent}
                        gridRef={cellsRef}
                        columns={count}
                        onMove={onMoveEvent}
                        onResize={onResizeEvent}
                        onKeyboardEdit={remember}
                      />
                    </ErrorBoundary>
                  ))}
                  {now !== null && (
                    <div
                      className="now-line"
                      data-testid="now-line"
                      aria-hidden="true"
                      style={{ insetBlockStart: `${now * 100}%` }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function blockStyle(block: TimedBlock): Vars {
  const color = calendarColorVars(block.calendarColor);
  return {
    insetBlockStart: `${block.top * 100}%`,
    blockSize: `${block.height * 100}%`,
    insetInlineStart: `${(block.column / block.columnCount) * 100}%`,
    inlineSize: `${(block.span / block.columnCount) * 100}%`,
    '--bar': color.bar,
    '--bar-bg': color.bg,
  };
}

function Block({
  block,
  timeFmt,
  onOpen,
  gridRef,
  columns,
  onMove,
  onResize,
  onKeyboardEdit,
}: {
  readonly block: TimedBlock;
  readonly timeFmt: TimeFormatOptions;
  readonly onOpen: (occurrence: Occurrence) => void;
  readonly gridRef: RefObject<HTMLElement | null>;
  readonly columns: number;
  readonly onMove?: ((occurrence: Occurrence, delta: DragDelta) => void) | undefined;
  readonly onResize?: ((occurrence: Occurrence, minutes: number) => void) | undefined;
  /** A key press moved or resized this event: the grid keeps focus on it afterwards. */
  readonly onKeyboardEdit: (eventId: string) => void;
}) {
  const t = useT();
  const { event, start, end } = block.occurrence;
  const title = event.title.trim() === '' ? t('untitled') : event.title;
  const sameDay = start.slice(0, 10) === end.slice(0, 10);
  const range = sameDay
    ? `${formatTime(start, timeFmt)} – ${formatTime(end, timeFmt)}`
    : formatTime(start, timeFmt);
  const drag = useBlockDrag({
    hourPx: HOUR_PX,
    columns,
    gridRef,
    onMove: (delta) => onMove?.(block.occurrence, delta),
  });
  const resize = useBlockDrag({
    hourPx: HOUR_PX,
    columns,
    gridRef,
    axis: 'y',
    onMove: (delta) => onResize?.(block.occurrence, delta.minutes),
  });
  // While the bottom edge is dragged the block grows or shrinks, caught to the step, never under
  // one step tall. The edge handle is hidden where the real end is on another day.
  const basePx = block.height * 24 * HOUR_PX;
  const resizedPx = Math.max(HOUR_PX / 4, basePx + (resize.delta.minutes / 60) * HOUR_PX);
  const style: Vars = {
    ...blockStyle(block),
    ...(drag.offset && { transform: `translate(${drag.offset.x}px, ${drag.offset.y}px)` }),
    ...(resize.offset && { blockSize: `${resizedPx}px` }),
  };
  return (
    <button
      type="button"
      className="block"
      style={style}
      data-short={block.height * 24 * HOUR_PX < SHORT_BLOCK_PX ? 'true' : undefined}
      data-dragging={drag.offset || resize.offset ? 'true' : undefined}
      data-open-start={block.startsBefore ? 'true' : undefined}
      data-open-end={block.endsAfter ? 'true' : undefined}
      title={`${title} · ${range}`}
      data-event-id={event.id}
      aria-keyshortcuts={
        onMove
          ? 'Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight Control+Shift+ArrowUp Control+Shift+ArrowDown'
          : undefined
      }
      onKeyDown={(e) => {
        if (!onMove || e.target !== e.currentTarget) return;
        const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
        const action = keyAction(
          e.code,
          { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey },
          rtl,
        );
        if (!action) return;
        if (action.kind === 'resize' && (!onResize || block.endsAfter)) return;
        e.preventDefault();
        onKeyboardEdit(event.id);
        if (action.kind === 'move') {
          onMove(block.occurrence, { days: action.days, minutes: action.minutes });
        } else {
          onResize?.(block.occurrence, action.minutes);
        }
      }}
      onClick={() => {
        const afterMove = drag.consumeClick();
        const afterResize = resize.consumeClick();
        if (!afterMove && !afterResize) onOpen(block.occurrence);
      }}
      {...(onMove ? drag.handlers : {})}
    >
      <span className="block-title">{title}</span>
      <span className="block-time">{range}</span>
      {onResize && !block.endsAfter && (
        <span
          className="block-resize"
          aria-hidden="true"
          onPointerDown={(e) => {
            e.stopPropagation(); // not a move of the whole block
            resize.handlers.onPointerDown(e);
          }}
        />
      )}
    </button>
  );
}

function FailedBlock({ block }: { readonly block: TimedBlock }) {
  const t = useT();
  return (
    <div className="block block-failed" style={blockStyle(block)}>
      {t('eventFailed')}
    </div>
  );
}

function allDayStyle(bar: AllDayBar): Vars {
  const color = calendarColorVars(bar.calendarColor);
  return {
    gridColumn: `${bar.startCol + 1} / ${bar.endCol + 2}`,
    gridRow: bar.lane + 1,
    '--bar': color.bar,
    '--bar-bg': color.bg,
  };
}

function AllDayItem({
  bar,
  onOpen,
  gridRef,
  columns,
  onMove,
  onKeyboardEdit,
}: {
  readonly bar: AllDayBar;
  readonly onOpen: (occurrence: Occurrence) => void;
  readonly gridRef: RefObject<HTMLElement | null>;
  readonly columns: number;
  readonly onMove?: ((occurrence: Occurrence, delta: DragDelta) => void) | undefined;
  readonly onKeyboardEdit: (eventId: string) => void;
}) {
  const t = useT();
  const title =
    bar.occurrence.event.title.trim() === '' ? t('untitled') : bar.occurrence.event.title;
  // An all-day item moves by whole days only (D-048).
  const drag = useBlockDrag({
    hourPx: HOUR_PX,
    columns,
    gridRef,
    axis: 'x',
    onMove: (delta) => onMove?.(bar.occurrence, { days: delta.days, minutes: 0 }),
  });
  const style: Vars = {
    ...allDayStyle(bar),
    ...(drag.offset && { transform: `translateX(${drag.offset.x}px)` }),
  };
  return (
    <button
      type="button"
      className="bar"
      style={style}
      data-dragging={drag.offset ? 'true' : undefined}
      data-open-start={bar.continuesBefore ? 'true' : undefined}
      data-open-end={bar.continuesAfter ? 'true' : undefined}
      data-event-id={bar.occurrence.event.id}
      aria-keyshortcuts={onMove ? 'Shift+ArrowLeft Shift+ArrowRight' : undefined}
      title={title}
      onKeyDown={(e) => {
        if (!onMove || e.target !== e.currentTarget) return;
        const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
        const action = keyAction(
          e.code,
          { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey },
          rtl,
        );
        if (action?.kind !== 'move' || action.days === 0) return;
        e.preventDefault();
        onKeyboardEdit(bar.occurrence.event.id);
        onMove(bar.occurrence, { days: action.days, minutes: 0 });
      }}
      onClick={() => {
        if (!drag.consumeClick()) onOpen(bar.occurrence);
      }}
      {...(onMove ? drag.handlers : {})}
    >
      <span className="bar-title">{title}</span>
    </button>
  );
}

function FailedAllDay({ bar }: { readonly bar: AllDayBar }) {
  const t = useT();
  return (
    <div className="bar bar-failed" style={allDayStyle(bar)}>
      {t('eventFailed')}
    </div>
  );
}
