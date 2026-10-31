import { useEffect, useRef, useState } from 'react';
import type { Ref } from 'react';
import { useT } from '@/features/i18n';
import type { MessageKey } from '@/features/i18n';
import { splitTitle } from '@/features/view';
import type { ViewKind } from '@/features/view';
import { ChevronIcon, MenuIcon, SearchIcon, ViewsIcon } from './Icons';

export interface TopBarProps {
  readonly title: string;
  /** A small second line (the Hijri date, when asked for). */
  readonly subtitle?: string | undefined;
  readonly view: ViewKind;
  readonly onView: (view: ViewKind) => void;
  readonly onMenu: () => void;
  readonly menuRef: Ref<HTMLButtonElement>;
  readonly drawerOpen: boolean;
  readonly onToday: () => void;
  /** Today's day number, already formatted; shown instead of the word on a phone (D-064). */
  readonly todayDay?: string | undefined;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onSearch: () => void;
}

const VIEWS: readonly [ViewKind, MessageKey][] = [
  ['agenda', 'viewAgenda'],
  ['day', 'viewDay'],
  ['days3', 'viewDays3'],
  ['week', 'viewWeek'],
  ['month', 'viewMonth'],
  ['year', 'viewYear'],
];

const PREVIOUS: Record<ViewKind, MessageKey> = {
  agenda: 'previousDay',
  day: 'previousDay',
  days3: 'previousDays3',
  week: 'previousWeek',
  month: 'previousMonth',
  year: 'previousYear',
};
const NEXT: Record<ViewKind, MessageKey> = {
  agenda: 'nextDay',
  day: 'nextDay',
  days3: 'nextDays3',
  week: 'nextWeek',
  month: 'nextMonth',
  year: 'nextYear',
};

export function TopBar({
  title,
  subtitle,
  view,
  onView,
  onMenu,
  menuRef,
  drawerOpen,
  onToday,
  todayDay,
  onPrevious,
  onNext,
  onSearch,
}: TopBarProps) {
  const t = useT();
  const { lead, rest } = splitTitle(title);
  // On a phone the six views live in a menu under the bar (D-079); elsewhere they sit in the bar.
  const [menuOpen, setMenuOpen] = useState(false);
  const viewsRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  return (
    <header className="topbar">
      <button
        ref={menuRef}
        type="button"
        className="icon-btn menu-btn"
        aria-label={t('menu')}
        aria-expanded={drawerOpen}
        aria-controls="sidebar"
        onClick={onMenu}
      >
        <MenuIcon />
      </button>
      <button type="button" className="btn tb-today" onClick={onToday}>
        <span className="tb-today-text">{t('today')}</span>
        {todayDay !== undefined && (
          <span className="tb-today-day" aria-hidden="true">
            {todayDay}
          </span>
        )}
      </button>
      {/* Each chevron is drawn pointing to the inline end and mirrored where needed. */}
      <button
        type="button"
        className="icon-btn flip-ltr tb-previous"
        aria-label={t(PREVIOUS[view])}
        onClick={onPrevious}
      >
        <ChevronIcon />
      </button>
      <button
        type="button"
        className="icon-btn flip-rtl tb-next"
        aria-label={t(NEXT[view])}
        onClick={onNext}
      >
        <ChevronIcon />
      </button>
      <h1 className="topbar-title" aria-live="polite">
        {lead !== undefined && `${lead} `}
        <span className={lead === undefined ? undefined : 'title-rest'}>{rest}</span>
        {subtitle && <small className="topbar-sub">{subtitle}</small>}
      </h1>
      <button
        type="button"
        className="icon-btn tb-search"
        aria-label={t('search')}
        onClick={onSearch}
      >
        <SearchIcon />
      </button>
      <button
        ref={viewsRef}
        type="button"
        className="icon-btn tb-views"
        aria-label={t('viewMenu')}
        aria-haspopup="true"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <ViewsIcon />
      </button>
      {menuOpen && (
        <div className="view-scrim" aria-hidden="true" onClick={() => setMenuOpen(false)} />
      )}
      <div
        role="group"
        aria-label={t('views')}
        className="view-switch"
        data-open={menuOpen ? 'true' : 'false'}
      >
        {VIEWS.map(([kind, key]) => (
          <button
            key={kind}
            type="button"
            className="btn view-btn"
            aria-pressed={view === kind}
            onClick={() => {
              if (menuOpen) {
                setMenuOpen(false);
                viewsRef.current?.focus();
              }
              onView(kind);
            }}
          >
            {t(key)}
          </button>
        ))}
      </div>
    </header>
  );
}
