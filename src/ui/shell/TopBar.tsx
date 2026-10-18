import type { Ref } from 'react';
import { useT } from '@/features/i18n';
import type { MessageKey } from '@/features/i18n';
import type { ViewKind } from '@/features/view';
import { ChevronIcon, MenuIcon } from './Icons';

export interface TopBarProps {
  readonly title: string;
  readonly view: ViewKind;
  readonly onView: (view: ViewKind) => void;
  readonly onMenu: () => void;
  readonly menuRef: Ref<HTMLButtonElement>;
  readonly drawerOpen: boolean;
  readonly onToday: () => void;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}

const VIEWS: readonly [ViewKind, MessageKey][] = [
  ['agenda', 'viewAgenda'],
  ['day', 'viewDay'],
  ['week', 'viewWeek'],
  ['month', 'viewMonth'],
];

const PREVIOUS: Record<ViewKind, MessageKey> = {
  agenda: 'previousDay',
  day: 'previousDay',
  week: 'previousWeek',
  month: 'previousMonth',
};
const NEXT: Record<ViewKind, MessageKey> = {
  agenda: 'nextDay',
  day: 'nextDay',
  week: 'nextWeek',
  month: 'nextMonth',
};

export function TopBar({
  title,
  view,
  onView,
  onMenu,
  menuRef,
  drawerOpen,
  onToday,
  onPrevious,
  onNext,
}: TopBarProps) {
  const t = useT();
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
      <button type="button" className="btn" onClick={onToday}>
        {t('today')}
      </button>
      {/* Each chevron is drawn pointing to the inline end and mirrored where needed. */}
      <button
        type="button"
        className="icon-btn flip-ltr"
        aria-label={t(PREVIOUS[view])}
        onClick={onPrevious}
      >
        <ChevronIcon />
      </button>
      <button
        type="button"
        className="icon-btn flip-rtl"
        aria-label={t(NEXT[view])}
        onClick={onNext}
      >
        <ChevronIcon />
      </button>
      <h1 className="topbar-title" aria-live="polite">
        {title}
      </h1>
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
