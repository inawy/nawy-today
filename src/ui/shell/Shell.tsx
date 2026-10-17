import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { Calendar } from '@/core/model';
import { useT } from '@/features/i18n';
import { trapTab } from '@/lib/focusTrap';
import { CloseIcon } from './Icons';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export interface ShellProps {
  readonly title: string;
  readonly calendars: readonly Calendar[];
  readonly onToggleCalendar: (id: string, visible: boolean) => void;
  readonly onToday: () => void;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly children: ReactNode;
}

/**
 * The frame: top bar, sidebar (permanent on wide screens, a drawer on narrow ones) and the main
 * area. The drawer closes on Escape, on the backdrop and on its close button, keeps focus inside
 * while open, and gives focus back to the menu button.
 */
export function Shell({
  title,
  calendars,
  onToggleCalendar,
  onToday,
  onPrevious,
  onNext,
  children,
}: ShellProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    menuRef.current?.focus();
  }, []);

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
        menuRef={menuRef}
        drawerOpen={open}
        onMenu={() => setOpen((v) => !v)}
        onToday={onToday}
        onPrevious={onPrevious}
        onNext={onNext}
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
        <Sidebar calendars={calendars} onToggleCalendar={onToggleCalendar} />
      </aside>
      {open && <div className="backdrop" aria-hidden="true" onClick={close} />}
      <main id="main" className="main">
        {children}
      </main>
    </div>
  );
}
