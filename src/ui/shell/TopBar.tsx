import type { Ref } from 'react';
import { useT } from '@/features/i18n';
import type { MessageKey } from '@/features/i18n';
import { splitTitle } from '@/features/view';
import type { ViewKind } from '@/features/view';
import { ChevronIcon, MenuIcon, SearchIcon } from './Icons';

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
];

const PREVIOUS: Record<ViewKind, MessageKey> = {
  agenda: 'previousDay',
  day: 'previousDay',
  days3: 'previousDays3',
  week: 'previousWeek',
  month: 'previousMonth',
};
const NEXT: Record<ViewKind, MessageKey> = {
  agenda: 'nextDay',
  day: 'nextDay',
  days3: 'nextDays3',
  week: 'nextWeek',
  month: 'nextMonth',
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
      <button type="button" className="btn tb-today" aria-label={t('today')} onClick={onToday}>
        <span className="tb-today-text" aria-hidden="true">
          {t('today')}
        </span>
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
      <div role="group" aria-label={t('views')} className="view-switch">
        {VIEWS.map(([kind, key]) => (
          <button
            key={kind}
            type="button"
            className="btn view-btn"
            aria-pressed={view === kind}
            onClick={() => onView(kind)}
          >
            {t(key)}
          </button>
        ))}
      </div>
    </header>
  );
}
