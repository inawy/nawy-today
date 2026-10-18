import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Calendar } from '@/core/model';
import { localTimeZone } from '@/core/time';
import type { FormatOptions, IsoWeekday } from '@/core/time';
import { draftToFields, isDirty, withStart } from '@/features/events';
import type { Draft, DraftError } from '@/features/events';
import { useT } from '@/features/i18n';
import type { MessageKey } from '@/features/i18n';
import { trapTab } from '@/lib/focusTrap';
import { CloseIcon } from '@/ui/shell/Icons';
import { RepeatFields } from './RepeatFields';

/** What the owner of the editor reports back after trying to save. */
export type SaveOutcome = { ok: true } | { ok: false; message: MessageKey | null };

export interface EventEditorProps {
  readonly mode: 'new' | 'edit';
  readonly initial: Draft;
  readonly calendars: readonly Calendar[];
  readonly fmt: FormatOptions;
  readonly weekStart: IsoWeekday;
  /** Called with a draft that already passed `draftToFields`. `null` message = user cancelled. */
  readonly onSave: (draft: Draft) => Promise<SaveOutcome>;
  readonly onDelete?: (() => void) | undefined;
  readonly onClose: () => void;
}

const ERROR_KEY: Record<DraftError, MessageKey> = {
  calendar: 'errCalendar',
  start: 'errStart',
  end: 'errEnd',
  order: 'errOrder',
  timezone: 'errTimezone',
  'title-too-long': 'errTitleLong',
  'repeat-interval': 'errInterval',
  'repeat-count': 'errCount',
  'repeat-until': 'errUntil',
};

function timeZoneOptions(current: string): string[] {
  const all = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  let listed: string[];
  try {
    listed = all ? all('timeZone') : [];
  } catch {
    listed = [];
  }
  return [...new Set([current, localTimeZone(), 'UTC', ...listed])];
}

/**
 * The full editor. Closing it (Escape, the close button, the backdrop) SAVES when something
 * changed and the values are valid; if saving is not possible it stays open with the reason and
 * the draft intact, and "discard" is the explicit way out. Nothing typed is ever dropped silently.
 */
export function EventEditor({
  mode,
  initial,
  calendars,
  fmt,
  weekStart,
  onSave,
  onDelete,
  onClose,
}: EventEditorProps) {
  const t = useT();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft>(initial);
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const busyRef = useRef(false);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const zones = useMemo(() => timeZoneOptions(initial.tzid), [initial.tzid]);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    setError(null);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  /** Validates and saves; resolves true when the editor may close. */
  const commit = useCallback(async (): Promise<boolean> => {
    if (busyRef.current) return false;
    const current = draftRef.current;
    const fields = draftToFields(current);
    if (!fields.ok) {
      setError(ERROR_KEY[fields.error]);
      return false;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const outcome = await onSave(current);
      if (outcome.ok) return true;
      setError(outcome.message);
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [onSave]);

  const requestClose = useCallback(async (): Promise<void> => {
    if (!isDirty(initial, draftRef.current)) {
      onClose();
      return;
    }
    // A new event nobody typed anything into is not worth saving: it has no content yet.
    if (await commit()) onClose();
  }, [commit, initial, onClose]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.code === 'Escape') {
      event.stopPropagation();
      void requestClose();
      return;
    }
    if (dialogRef.current) trapTab(dialogRef.current, event.nativeEvent);
  };

  const submit = async (): Promise<void> => {
    if (await commit()) onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && void requestClose()}>
      <div
        ref={dialogRef}
        className="modal ed"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <header className="ed-head">
            <h2 id={titleId}>{mode === 'new' ? t('newEvent') : t('editEvent')}</h2>
            <button
              type="button"
              className="icon-btn"
              aria-label={t('close')}
              onClick={() => void requestClose()}
            >
              <CloseIcon />
            </button>
          </header>

          <div className="ed-body">
            <input
              ref={titleRef}
              className="ed-title"
              aria-label={t('eventTitle')}
              placeholder={t('eventTitlePlaceholder')}
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
            />

            <label className="ed-check">
              <input
                type="checkbox"
                checked={draft.allDay}
                onChange={(e) => set('allDay', e.target.checked)}
              />
              <span>{t('allDay')}</span>
            </label>

            <fieldset className="ed-group">
              <legend>{t('starts')}</legend>
              <input
                type="date"
                aria-label={`${t('starts')} · ${t('date')}`}
                value={draft.startDate}
                onChange={(e) => {
                  setError(null);
                  setDraft((d) => withStart(d, { startDate: e.target.value }));
                }}
              />
              {!draft.allDay && (
                <input
                  type="time"
                  aria-label={`${t('starts')} · ${t('time')}`}
                  value={draft.startTime}
                  onChange={(e) => {
                    setError(null);
                    setDraft((d) => withStart(d, { startTime: e.target.value }));
                  }}
                />
              )}
            </fieldset>

            <fieldset className="ed-group">
              <legend>{t('ends')}</legend>
              <input
                type="date"
                aria-label={`${t('ends')} · ${t('date')}`}
                value={draft.endDate}
                onChange={(e) => set('endDate', e.target.value)}
              />
              {!draft.allDay && (
                <input
                  type="time"
                  aria-label={`${t('ends')} · ${t('time')}`}
                  value={draft.endTime}
                  onChange={(e) => set('endTime', e.target.value)}
                />
              )}
            </fieldset>

            {!draft.allDay && (
              <label className="ed-field">
                <span>{t('timeZone')}</span>
                <select value={draft.tzid} onChange={(e) => set('tzid', e.target.value)}>
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <RepeatFields
              value={draft.repeat}
              onChange={(r) => set('repeat', r)}
              fmt={fmt}
              weekStart={weekStart}
            />

            <label className="ed-field">
              <span>{t('calendar')}</span>
              <select value={draft.calendarId} onChange={(e) => set('calendarId', e.target.value)}>
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="ed-field">
              <span>{t('location')}</span>
              <input value={draft.location} onChange={(e) => set('location', e.target.value)} />
            </label>

            <label className="ed-field">
              <span>{t('notes')}</span>
              <textarea
                rows={3}
                value={draft.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </label>

            {error !== null && (
              <p role="alert" className="ed-error">
                {t(error)}
              </p>
            )}
          </div>

          <footer className="ed-foot">
            {onDelete && (
              <button type="button" className="btn btn-danger" onClick={onDelete} disabled={busy}>
                {t('delete')}
              </button>
            )}
            <span className="ed-spacer" />
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              {isDirty(initial, draft) ? t('discard') : t('cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? t('saving') : t('save')}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
