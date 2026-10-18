import type { CSSProperties, ReactNode } from 'react';
import { ErrorBoundary } from '@/lib/ErrorBoundary';
import { formatTime } from '@/core/time';
import type { FormatOptions, PlainDateTime, TimeFormatOptions } from '@/core/time';
import type { Occurrence } from '@/core/recurrence';
import type { AgendaItem, AgendaModel } from '@/features/agenda';
import { useT } from '@/features/i18n';
import { useSettings } from '@/features/settings';
import { calendarColorVars } from '@/ui/theme/calendarColor';

export interface AgendaViewProps {
  readonly model: AgendaModel;
  readonly nowLocal: PlainDateTime;
  readonly onOpenEvent: (occurrence: Occurrence) => void;
}

type Vars = CSSProperties & Record<`--${string}`, string | number>;

/** The phone's main screen: one day as a plain vertical list, with a marker for "now". */
export function AgendaView({ model, nowLocal, onOpenEvent }: AgendaViewProps) {
  const t = useT();
  const { settings } = useSettings();
  const fmt: FormatOptions = { locale: settings.locale, numerals: settings.numerals };
  const timeFmt: TimeFormatOptions = { ...fmt, hour12: settings.hour12 };

  if (model.items.length === 0 && model.nowIndex === null) {
    return <p className="agenda-empty muted">{t('agendaEmpty')}</p>;
  }

  const rows: ReactNode[] = [];
  model.items.forEach((item, i) => {
    if (model.nowIndex === i)
      rows.push(<NowMarker key="now" nowLocal={nowLocal} timeFmt={timeFmt} />);
    rows.push(
      <li key={item.key}>
        <ErrorBoundary fallback={() => <p className="agenda-failed muted">{t('eventFailed')}</p>}>
          <Row item={item} timeFmt={timeFmt} onOpen={onOpenEvent} />
        </ErrorBoundary>
      </li>,
    );
  });
  if (model.nowIndex === model.items.length) {
    rows.push(<NowMarker key="now" nowLocal={nowLocal} timeFmt={timeFmt} />);
  }
  return (
    <div className="agenda">
      {model.items.length === 0 && <p className="agenda-empty muted">{t('agendaEmpty')}</p>}
      <ul className="agenda-list">{rows}</ul>
    </div>
  );
}

function NowMarker({
  nowLocal,
  timeFmt,
}: {
  readonly nowLocal: PlainDateTime;
  readonly timeFmt: TimeFormatOptions;
}) {
  const t = useT();
  return (
    <li className="agenda-now" aria-label={t('agendaNow')} data-testid="agenda-now">
      <span>{formatTime(nowLocal, timeFmt)}</span>
    </li>
  );
}

function Row({
  item,
  timeFmt,
  onOpen,
}: {
  readonly item: AgendaItem;
  readonly timeFmt: TimeFormatOptions;
  readonly onOpen: (occurrence: Occurrence) => void;
}) {
  const t = useT();
  const { event, start, end } = item.occurrence;
  const title = event.title.trim() === '' ? t('untitled') : event.title;
  const color = calendarColorVars(item.calendarColor);
  const sameDay = start.slice(0, 10) === end.slice(0, 10);
  const when = item.allDay
    ? t('allDay')
    : sameDay && end > start
      ? `${formatTime(start, timeFmt)} – ${formatTime(end, timeFmt)}`
      : formatTime(start, timeFmt);
  return (
    <button
      type="button"
      className="agenda-item"
      data-status={item.status}
      style={{ '--bar': color.bar, '--bar-bg': color.bg } as Vars}
      onClick={() => onOpen(item.occurrence)}
    >
      <span className="agenda-when">{when}</span>
      <span className="agenda-title">{title}</span>
      {event.location !== undefined && event.location !== '' && (
        <span className="agenda-where muted">{event.location}</span>
      )}
    </button>
  );
}
