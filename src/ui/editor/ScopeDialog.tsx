import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Scope } from '@/features/events';
import { useT } from '@/features/i18n';
import type { MessageKey } from '@/features/i18n';
import { trapTab } from '@/lib/focusTrap';

export interface ScopeDialogProps {
  readonly kind: 'edit' | 'delete';
  /** "This event only" is not possible when the repeat rule itself was changed. */
  readonly allowThis: boolean;
  /** Warn that moving the whole series drops single-day changes. */
  readonly warnReset: boolean;
  readonly onChoose: (scope: Scope) => void;
  readonly onCancel: () => void;
}

const OPTIONS: readonly { scope: Scope; label: MessageKey }[] = [
  { scope: 'this', label: 'scopeThis' },
  { scope: 'following', label: 'scopeFollowing' },
  { scope: 'all', label: 'scopeAll' },
];

export function ScopeDialog({ kind, allowThis, warnReset, onChoose, onCancel }: ScopeDialogProps) {
  const t = useT();
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [scope, setScope] = useState<Scope>(allowThis ? 'this' : 'following');

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input:checked')?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.code === 'Escape') {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (ref.current) trapTab(ref.current, event.nativeEvent);
  };

  return (
    <div className="modal-backdrop modal-top">
      <div
        ref={ref}
        className="modal scope"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onChoose(scope);
          }}
        >
          <h2 id={titleId}>{kind === 'edit' ? t('scopeEditTitle') : t('scopeDeleteTitle')}</h2>
          <div className="scope-options" role="radiogroup" aria-labelledby={titleId}>
            {OPTIONS.map((o) => (
              <label key={o.scope} className="ed-check">
                <input
                  type="radio"
                  name="scope"
                  value={o.scope}
                  checked={scope === o.scope}
                  disabled={o.scope === 'this' && !allowThis}
                  onChange={() => setScope(o.scope)}
                />
                <span>{t(o.label)}</span>
              </label>
            ))}
          </div>
          {kind === 'edit' && warnReset && scope === 'all' && (
            <p className="muted scope-note">{t('scopeNote')}</p>
          )}
          <div className="ed-foot">
            <span className="ed-spacer" />
            <button type="button" className="btn" onClick={onCancel}>
              {t('cancel')}
            </button>
            <button
              type="submit"
              className={kind === 'delete' ? 'btn btn-danger' : 'btn btn-primary'}
            >
              {kind === 'edit' ? t('save') : t('delete')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
