import type { Ref } from 'react';
import { useT } from '@/features/i18n';
import { ChevronIcon, MenuIcon } from './Icons';

export interface TopBarProps {
  readonly title: string;
  readonly onMenu: () => void;
  readonly menuRef: Ref<HTMLButtonElement>;
  readonly drawerOpen: boolean;
  readonly onToday: () => void;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}

export function TopBar({
  title,
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
      {/* Previous points toward the start of the line: the chevron is mirrored by direction. */}
      <button
        type="button"
        className="icon-btn flip-ltr"
        aria-label={t('previousMonth')}
        onClick={onPrevious}
      >
        <ChevronIcon />
      </button>
      <button
        type="button"
        className="icon-btn flip-rtl"
        aria-label={t('nextMonth')}
        onClick={onNext}
      >
        <ChevronIcon />
      </button>
      <h1 className="topbar-title" aria-live="polite">
        {title}
      </h1>
    </header>
  );
}
