import { useCallback, useEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { Calendar } from '@/core/model';
import { useT } from '@/features/i18n';
import type { ViewKind } from '@/features/view';
import { trapTab } from '@/lib/focusTrap';
import { CloseIcon } from './Icons';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export interface ShellProps {
  readonly title: string;
  readonly view: ViewKind;
  readonly onView: (view: ViewKind) => void;
  /** The drawer (narrow screens) is controlled so shortcuts can pause while it is open. */
  readonly drawerOpen: boolean;
  readonly onDrawerOpenChange: (open: boolean) => void;
  readonly calendars: readonly Calendar[];
  readonly onToggleCalendar: (id: string, visible: boolean) => void;
  readonly onToday: () => void;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onSearch: () => void;
  readonly onInstall?: (() => void) | undefined;
  readonly onOpenData?: (() => void) | undefined;
  readonly children: ReactNode;
}

/**
 * The frame: top bar, sidebar (permanent on wide screens, a drawer on narrow ones) and the main
 * area. The drawer closes on Escape, on the backdrop and on its close button, keeps focus inside
 * while open, and gives focus back to the menu button.
 */
export function Shell({
  title,
  view,
  onView,
  drawerOpen: open,
  onDrawerOpenChange: setOpen,
  calendars,
  onToggleCalendar,
  onToday,
  onPrevious,
  onNext,
  onSearch,
  onInstall,
  onOpenData,
  children,
}: ShellProps) {
  const t = useT();
  const menuRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    menuRef.current?.focus();
  }, [setOpen]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (!open) return;
    if (event.code === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (sidebarRef.current) trapTab(sidebarRef.current, event.nativeEvent);
  };

  return (
    <div className="shell" data-drawer={open ? 'open' : 'closed'}>
      <a className="skip-link" href="#main">
        {t('skipToContent')}
      </a>
      <TopBar
        title={title}
        view={view}
        onView={onView}
        menuRef={menuRef}
        drawerOpen={open}
        onMenu={() => setOpen(!open)}
        onToday={onToday}
        onPrevious={onPrevious}
        onNext={onNext}
        onSearch={onSearch}
      />
      <aside id="sidebar" ref={sidebarRef} className="sidebar" onKeyDown={onKeyDown}>
        <button
          ref={closeRef}
          type="button"
          className="icon-btn drawer-close"
          aria-label={t('closeMenu')}
          onClick={close}
        >
          <CloseIcon />
        </button>
        <Sidebar
          calendars={calendars}
          onToggleCalendar={onToggleCalendar}
          onInstall={onInstall}
          onOpenData={onOpenData}
        />
      </aside>
      {open && <div className="backdrop" aria-hidden="true" onClick={close} />}
      <main id="main" className="main">
        {children}
      </main>
    </div>
  );
}
