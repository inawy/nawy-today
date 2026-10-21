import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import type { Calendar } from '@/core/model';
import { cleanCalendarName } from '@/features/calendars';
import { useT } from '@/features/i18n';
import type { MessageKey } from '@/features/i18n';
import { trapTab } from '@/lib/focusTrap';
import { useBackLayer } from '@/lib/useBackLayer';
import { useVisualViewport } from '@/lib/useVisualViewport';
import { CloseIcon } from '@/ui/shell/Icons';
import { calendarColorVars } from '@/ui/theme/calendarColor';
import { CALENDAR_COLOR_IDS } from '@/ui/theme/tokens';
import type { CalendarColorId } from '@/ui/theme/tokens';

const COLOR_NAMES: Record<CalendarColorId, MessageKey> = {
  blue: 'colorBlue',
  red: 'colorRed',
  green: 'colorGreen',
  amber: 'colorAmber',
  purple: 'colorPurple',
  teal: 'colorTeal',
  pink: 'colorPink',
  gray: 'colorGray',
};

export interface CalendarDialogProps {
  /** The calendar being edited, or `undefined` for a new one. */
  readonly calendar: Calendar | undefined;
  readonly suggestedColor: string;
  readonly canDelete: boolean;
  readonly onSave: (input: { id?: string; name: string; color: string }) => Promise<boolean>;
  readonly onDelete: (id: string) => Promise<boolean>;
  readonly onClose: () => void;
}

export function CalendarDialog({
  calendar,
  suggestedColor,
  canDelete,
  onSave,
  onDelete,
  onClose,
}: CalendarDialogProps) {
  const t = useT();
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(calendar?.name ?? '');
  const [color, setColor] = useState(calendar?.color ?? suggestedColor);
  const [error, setError] = useState<MessageKey | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  useVisualViewport();
  useBackLayer(true, () => {
    onClose();
    return Promise.resolve(true);
  });

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.code === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (ref.current) trapTab(ref.current, event.nativeEvent);
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const clean = cleanCalendarName(name);
    if (clean === null) {
      setError('calendarNameRequired');
      nameRef.current?.focus();
      return;
    }
    setBusy(true);
    const ok = await onSave({ ...(calendar ? { id: calendar.id } : {}), name: clean, color });
    setBusy(false);
    if (ok) onClose();
    else setError('calendarSaveFailed');
  };

  const remove = async (): Promise<void> => {
    if (!calendar) return;
    setBusy(true);
    const ok = await onDelete(calendar.id);
    setBusy(false);
    if (ok) onClose();
    else setError('calendarSaveFailed');
  };

  return (
    <div className="modal-backdrop">
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <form onSubmit={(e) => void submit(e)}>
          <div className="ed-head">
            <h2 id={titleId}>{t(calendar ? 'calendarEdit' : 'calendarNew')}</h2>
            <button type="button" className="icon-btn" aria-label={t('close')} onClick={onClose}>
              <CloseIcon />
            </button>
          </div>
          <div className="ed-body">
            <label className="ed-field">
              <span>{t('calendarName')}</span>
              <input
                ref={nameRef}
                value={name}
                maxLength={60}
                autoComplete="off"
                aria-invalid={error === 'calendarNameRequired'}
                onChange={(e) => {
                  setName(e.currentTarget.value);
                  setError(null);
                }}
              />
            </label>
            <fieldset className="ed-group">
              <legend>{t('calendarColor')}</legend>
              <div className="swatches" role="radiogroup" aria-label={t('calendarColor')}>
                {CALENDAR_COLOR_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={color === id}
                    aria-label={t(COLOR_NAMES[id])}
                    className="swatch"
                    style={{ background: calendarColorVars(id).bar }}
                    onClick={() => setColor(id)}
                  />
                ))}
              </div>
            </fieldset>
            {error && (
              <p role="alert" className="ed-error">
                {t(error)}
              </p>
            )}
            {calendar &&
              (confirming ? (
                <div className="ed-error" role="group">
                  <p>{t('calendarDeleteWarn')}</p>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy}
                    onClick={() => void remove()}
                  >
                    {t('calendarDeleteConfirm')}
                  </button>
                </div>
              ) : canDelete ? (
                <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>
                  {t('calendarDelete')}
                </button>
              ) : (
                <p className="muted">{t('calendarLastOne')}</p>
              ))}
          </div>
          <footer className="ed-foot">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {t('save')}
            </button>
            <button type="button" className="btn" onClick={onClose}>
              {t('cancel')}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
