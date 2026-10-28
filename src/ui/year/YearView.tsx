import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import {
  addDays,
  formatDate,
  formatDayOfMonth,
  formatMonthTitle,
  formatWeekday,
} from '@/core/time';
import type { FormatOptions, PlainDate } from '@/core/time';
import { useT } from '@/features/i18n';
import type { YearModel, YearMonth } from '@/features/year';

export interface YearViewProps {
  readonly model: YearModel;
  readonly today: PlainDate;
  /** The day the rest of the app is on: it is the one tab stop of the whole year. */
  readonly anchor: PlainDate;
  readonly fmt: FormatOptions;
  /** Touching a day opens it. */
  readonly onOpenDay: (date: PlainDate) => void;
  /** Touching a month's name opens that month. */
  readonly onOpenMonth: (date: PlainDate) => void;
}

/** Twelve small months. A dot under a day means it has events; touching it opens the day. */
export function YearView({ model, today, anchor, fmt, onOpenDay, onOpenMonth }: YearViewProps) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const inYear = model.months.some((m) =>
    m.weeks.some((w) => w.some((d) => d.inMonth && d.date === anchor)),
  );
  const stop = inYear ? anchor : (model.months[0]?.first ?? anchor);

  // One tab stop for 365 days: arrow keys move through them by date.
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
    const button = buttons.current.get(addDays(from as PlainDate, step));
    if (!button) return;
    event.preventDefault();
    button.focus();
  };

  // Weekday initials, in the order the week starts on, taken from any real week of the year.
  const heads = (model.months[0]?.weeks[0] ?? []).map((d) => formatWeekday(d.date, fmt, 'narrow'));

  return (
    <div className="year" onKeyDown={onKeyDown}>
      {model.months.map((month) => (
        <MonthCard
          key={month.month}
          month={month}
          heads={heads}
          today={today}
          stop={stop}
          fmt={fmt}
          buttons={buttons.current}
          onOpenDay={onOpenDay}
          onOpenMonth={onOpenMonth}
        />
      ))}
    </div>
  );
}

function MonthCard({
  month,
  heads,
  today,
  stop,
  fmt,
  buttons,
  onOpenDay,
  onOpenMonth,
}: {
  readonly month: YearMonth;
  readonly heads: readonly string[];
  readonly today: PlainDate;
  readonly stop: PlainDate;
  readonly fmt: FormatOptions;
  readonly buttons: Map<string, HTMLButtonElement>;
  readonly onOpenDay: (date: PlainDate) => void;
  readonly onOpenMonth: (date: PlainDate) => void;
}) {
  const t = useT();
  const title = formatMonthTitle(month.first, fmt);
  return (
    <section className="year-month" aria-label={title}>
      <h2 className="year-month-title">
        <button type="button" className="year-month-open" onClick={() => onOpenMonth(month.first)}>
          {title}
        </button>
      </h2>
      <div className="year-grid">
        <div className="year-heads" aria-hidden="true">
          {heads.map((h, i) => (
            <span key={i} className="year-head">
              {h}
            </span>
          ))}
        </div>
        {month.weeks.map((week, w) => (
          <div key={w} className="year-week">
            {week.map((day) =>
              day.inMonth ? (
                <button
                  key={day.date}
                  ref={(node) => {
                    if (node) buttons.set(day.date, node);
                    else buttons.delete(day.date);
                  }}
                  type="button"
                  className="year-day"
                  data-day={day.date}
                  data-today={day.date === today ? 'true' : undefined}
                  data-busy={day.count === 0 ? undefined : day.count > 2 ? 'many' : 'some'}
                  tabIndex={day.date === stop ? 0 : -1}
                  aria-label={
                    day.count === 0
                      ? formatDate(day.date, fmt, 'full')
                      : t('yearDayCount', {
                          date: formatDate(day.date, fmt, 'full'),
                          count: new Intl.NumberFormat(fmt.locale, {
                            numberingSystem: fmt.numerals ?? 'latn',
                          }).format(day.count),
                        })
                  }
                  onClick={() => onOpenDay(day.date)}
                >
                  {formatDayOfMonth(day.date, fmt)}
                </button>
              ) : (
                <span key={day.date} className="year-day year-day-empty" aria-hidden="true" />
              ),
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
