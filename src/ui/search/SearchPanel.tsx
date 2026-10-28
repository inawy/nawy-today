import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { formatDate, formatTime } from '@/core/time';
import type { FormatOptions, PlainDate, TimeFormatOptions } from '@/core/time';
import type { Occurrence } from '@/core/recurrence';
import { searchEvents } from '@/features/search';
import type { SearchIndex, SearchResult } from '@/features/search';
import { useT } from '@/features/i18n';
import { useSettings } from '@/features/settings';
import { trapTab } from '@/lib/focusTrap';
import { calendarColorVars } from '@/ui/theme/calendarColor';

export interface SearchPanelProps {
  readonly index: SearchIndex;
  readonly today: PlainDate;
  readonly onOpen: (occurrence: Occurrence) => void;
  readonly onClose: () => void;
  /** Queries that led to an opened event before (D-065); empty or absent hides the list. */
  readonly recent?: readonly string[];
  readonly onRemember?: (query: string) => void;
  readonly onClearRecent?: () => void;
}

type Vars = CSSProperties & Record<`--${string}`, string | number>;

/** Live search: results update as you type, nearest to today first; picking one opens it. */
export function SearchPanel({
  index,
  today,
  onOpen,
  onClose,
  recent = [],
  onRemember,
  onClearRecent,
}: SearchPanelProps) {
  const t = useT();
  const { settings } = useSettings();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const fmt: FormatOptions = { locale: settings.locale, numerals: settings.numerals };
  const timeFmt: TimeFormatOptions = { ...fmt, hour12: settings.hour12 };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => searchEvents(index, deferred, today), [index, deferred, today]);
  const typed = deferred.trim() !== '';
  const count = new Intl.NumberFormat(settings.locale, {
    numberingSystem: settings.numerals,
  }).format(results.length);

  const open = (occurrence: Occurrence): void => {
    onRemember?.(query);
    onOpen(occurrence);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.code === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (dialogRef.current) trapTab(dialogRef.current, event.nativeEvent);
  };

  return (
    <div
      className="modal-backdrop search-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        className="modal search"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className="sr-only">
          {t('search')}
        </h2>
        <input
          ref={inputRef}
          type="search"
          className="search-input"
          aria-label={t('search')}
          placeholder={t('searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            const first = results[0];
            if (e.code === 'Enter' && first) {
              e.preventDefault();
              open(first.occurrence);
            }
          }}
        />
        <p role="status" className="search-status muted">
          {!typed
            ? t('searchHint')
            : results.length === 0
              ? t('searchNone')
              : t('searchCount', { count })}
        </p>
        {!typed && recent.length > 0 && (
          <section className="search-recent" aria-label={t('searchRecent')}>
            <div className="search-recent-head">
              <h3 className="muted">{t('searchRecent')}</h3>
              <button type="button" className="btn" onClick={onClearRecent}>
                {t('searchRecentClear')}
              </button>
            </div>
            <ul className="search-recent-list">
              {recent.map((q) => (
                <li key={q}>
                  <button
                    type="button"
                    className="search-recent-item"
                    onClick={() => {
                      setQuery(q);
                      inputRef.current?.focus();
                    }}
                  >
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <ul className="search-list">
          {results.map((r) => (
            <li key={r.occurrence.key}>
              <Row result={r} fmt={fmt} timeFmt={timeFmt} onOpen={open} />
            </li>
          ))}
        </ul>
        <div className="ed-foot">
          <span className="ed-spacer" />
          <button type="button" className="btn" onClick={onClose}>
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  result,
  fmt,
  timeFmt,
  onOpen,
}: {
  readonly result: SearchResult;
  readonly fmt: FormatOptions;
  readonly timeFmt: TimeFormatOptions;
  readonly onOpen: (occurrence: Occurrence) => void;
}) {
  const t = useT();
  const { occurrence } = result;
  const { event, start } = occurrence;
  const color = calendarColorVars(result.calendarColor);
  const title = event.title.trim() === '' ? t('untitled') : event.title;
  const when = event.allDay
    ? `${formatDate(start.slice(0, 10), fmt, 'medium')} · ${t('allDay')}`
    : `${formatDate(start.slice(0, 10), fmt, 'medium')} · ${formatTime(start, timeFmt)}`;
  return (
    <button
      type="button"
      className="search-item"
      style={{ '--bar': color.bar, '--bar-bg': color.bg } as Vars}
      onClick={() => onOpen(occurrence)}
    >
      <span className="search-title">{title}</span>
      <span className="search-when muted">{when}</span>
      {event.location !== undefined && event.location !== '' && (
        <span className="search-where muted">{event.location}</span>
      )}
    </button>
  );
}
