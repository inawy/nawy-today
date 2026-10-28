import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { useT } from '@/features/i18n';
import { SHORTCUT_GROUPS } from '@/features/view';
import { trapTab } from '@/lib/focusTrap';
import { CloseIcon } from '../shell/Icons';
import { useSwipeClose } from '../shell/useSwipeClose';

export interface ShortcutsDialogProps {
  readonly onClose: () => void;
}

/** The keyboard shortcuts, listed (D-047). Read-only: nothing here changes anything. */
export function ShortcutsDialog({ onClose }: ShortcutsDialogProps) {
  const t = useT();
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);
  const swipe = useSwipeClose('down', onClose);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.code === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (ref.current) trapTab(ref.current, event.nativeEvent);
  };

  return (
    <div className="modal-backdrop">
      <div
        ref={ref}
        className="modal shortcuts"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="ed-head sheet-grip" {...swipe}>
          <h2 id={titleId}>{t('shortcutsTitle')}</h2>
          <button type="button" className="icon-btn" aria-label={t('close')} onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        <div className="ed-body">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} aria-labelledby={`${titleId}-${group.title}`}>
              <h3 id={`${titleId}-${group.title}`} className="shortcut-group">
                {t(group.title)}
              </h3>
              <dl className="shortcut-list">
                {group.rows.map((row) => (
                  <div key={row.keys.join('+') + row.label} className="shortcut-row">
                    <dt>{t(row.label)}</dt>
                    <dd>
                      {row.keys.map((key, i) => (
                        <span key={key}>
                          {i > 0 && <span aria-hidden="true">+</span>}
                          <kbd>{key}</kbd>
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <p className="muted">{t('shortcutsNote')}</p>
        </div>
      </div>
    </div>
  );
}
