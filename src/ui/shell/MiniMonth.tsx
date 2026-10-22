import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  addDays,
  dateParts,
  firstOfMonth,
  formatDate,
  formatDayOfMonth,
  formatMonthTitle,
  formatWeekday,
  monthGrid,
} from '@/core/time';
import type { FormatOptions, IsoWeekday, PlainDate } from '@/core/time';
import { useT } from '@/features/i18n';
import { monthOf, shiftMonth } from '@/features/month';
import { ChevronIcon } from './Icons';

export interface MiniMonthProps {
  /** The date the main view is on. */
  readonly anchor: PlainDate;
  readonly today: PlainDate;
  readonly weekStart: IsoWeekday;
  readonly fmt: FormatOptions;
  readonly onPick: (date: PlainDate) => void;
}

/** A small month for jumping to a date: browsing it never moves the main view until a day is picked. */
export function MiniMonth({ anchor, today, weekStart, fmt, onPick }: MiniMonthProps) {
  const t = useT();
  const [delta, setDelta] = useState(0);
  const [seen, setSeen] = useState(anchor);
  if (seen !== anchor) {
    setSeen(anchor);
    setDelta(0);
  }
  const shown = shiftMonth(monthOf(anchor), delta);
  const weeks = monthGrid(shown.year, shown.month, weekStart);
  const first = firstOfMonth(shown.year, shown.month);
  const days = weeks.flat();
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  // One tab stop for the whole grid (arrow keys move inside it), so a keyboard user does not have
  // to tab through 42 days to reach the calendar.
  const stop = days.includes(anchor) ? anchor : first;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const from = (event.target as HTMLElement).dataset['day'];
    if (!from) return;
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const step =
      event.code === 'ArrowRight'
        ? rtl
          ? -1
          : 1
        : event.code === 'ArrowLeft'
          ? rtl
            ? 1
            : -1
          : event.code === 'ArrowDown'
            ? 7
            : event.code === 'ArrowUp'
              ? -7
              : 0;
    if (step === 0) return;
    const target = addDays(from as PlainDate, step);
    const button = buttons.current.get(target);
    if (!button) return;
    event.preventDefault();
    button.focus();
  };

  return (
    <section className="mini" aria-label={formatMonthTitle(first, fmt)}>
      <div className="mini-head">
        <h2 className="mini-title">{formatMonthTitle(first, fmt)}</h2>
        <button
          type="button"
          className="icon-btn flip-ltr"
          aria-label={t('miniPrevious')}
          onClick={() => setDelta(delta - 1)}
        >
          <ChevronIcon />
        </button>
        <button
          type="button"
          className="icon-btn flip-rtl"
          aria-label={t('miniNext')}
          onClick={() => setDelta(delta + 1)}
        >
          <ChevronIcon />
        </button>
      </div>
      <div className="mini-grid" onKeyDown={onKeyDown}>
        {(weeks[0] ?? []).map((d) => (
          <span key={d} className="mini-dow" aria-hidden="true">
            {formatWeekday(d, fmt, 'narrow')}
          </span>
        ))}
        {weeks.flat().map((day) => (
          <button
            key={day}
            ref={(el) => {
              if (el) buttons.current.set(day, el);
              else buttons.current.delete(day);
            }}
            type="button"
            className="mini-day"
            data-day={day}
            tabIndex={day === stop ? 0 : -1}
            data-outside={dateParts(day).month === shown.month ? undefined : 'true'}
            data-today={day === today ? 'true' : undefined}
            data-selected={day === anchor ? 'true' : undefined}
            aria-label={`${formatDayOfMonth(day, fmt)}, ${formatDate(day, fmt, 'full')}`}
            aria-current={day === today ? 'date' : undefined}
            onClick={() => onPick(day)}
          >
            {formatDayOfMonth(day, fmt)}
          </button>
        ))}
      </div>
    </section>
  );
}
