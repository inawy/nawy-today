import type { CSSProperties } from 'react';
import { ErrorBoundary } from '@/lib/ErrorBoundary';
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
import { calendarColorVars } from '@/ui/theme/calendarColor';

export interface MonthViewProps {
  readonly model: MonthModel;
  readonly today: PlainDate;
  /** Lanes under each day number (matches the `maxLanes` the model was built with). */
  readonly lanes: number;
  /** Opens the day view for a date (day number or its "+N"). */
  readonly onOpenDay: (date: PlainDate) => void;
  /** Opens an event for editing. */
  readonly onOpenEvent: (occurrence: Occurrence) => void;
}

type Vars = CSSProperties & Record<`--${string}`, string | number>;

export function MonthView({ model, today, lanes, onOpenDay, onOpenEvent }: MonthViewProps) {
  const t = useT();
  const { settings } = useSettings();
  const fmt: FormatOptions = { locale: settings.locale, numerals: settings.numerals };
  const timeFmt: TimeFormatOptions = { ...fmt, hour12: settings.hour12 };
  const header = model.weeks[0]?.days ?? [];

  return (
    <div className="month" style={{ '--lanes': lanes } as Vars}>
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
          fmt={fmt}
          timeFmt={timeFmt}
          onOpenDay={onOpenDay}
          onOpenEvent={onOpenEvent}
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
  readonly fmt: FormatOptions;
  readonly timeFmt: TimeFormatOptions;
  readonly onOpenDay: (date: PlainDate) => void;
  readonly onOpenEvent: (occurrence: Occurrence) => void;
  readonly moreLabel: (count: number) => string;
}

function WeekRow({
  week,
  month,
  today,
  lanes,
  fmt,
  timeFmt,
  onOpenDay,
  onOpenEvent,
  moreLabel,
}: WeekRowProps) {
  return (
    <div className="week">
      {week.days.map((day, col) => {
        const inMonth = Number(day.slice(5, 7)) === month;
        return (
          <div
            key={day}
            className="day"
            data-outside={inMonth ? undefined : 'true'}
            data-today={day === today ? 'true' : undefined}
            style={{ gridColumn: col + 1 } as Vars}
          >
            <button
              type="button"
              className="day-btn"
              aria-label={
                settings.hijri
                  ? `${formatDate(day, fmt, 'full')} · ${formatHijriDate(day, fmt)}`
                  : formatDate(day, fmt, 'full')
              }
              aria-current={day === today ? 'date' : undefined}
              onClick={() => onOpenDay(day)}
            >
              <time className="day-number" dateTime={day}>
                {formatDayOfMonth(day, fmt)}
              </time>
              {settings.hijri && (
                <span className="hijri-num" aria-hidden="true">
                  {formatHijriDay(day, fmt)}
                </span>
              )}
            </button>
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
          <EventBar bar={bar} timeFmt={timeFmt} onOpen={onOpenEvent} />
        </ErrorBoundary>
      ))}
    </div>
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
}: {
  readonly bar: MonthBar;
  readonly timeFmt: TimeFormatOptions;
  readonly onOpen: (occurrence: Occurrence) => void;
}) {
  const t = useT();
  const { event, start } = bar.occurrence;
  const title = event.title.trim() === '' ? t('untitled') : event.title;
  return (
    <button
      type="button"
      className="bar"
      style={barStyle(bar)}
      data-open-start={bar.continuesBefore ? 'true' : undefined}
      data-open-end={bar.continuesAfter ? 'true' : undefined}
      title={title}
      onClick={() => onOpen(bar.occurrence)}
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
