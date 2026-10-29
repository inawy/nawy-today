import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import type { Calendar } from '@/core/model';
import type { Draft } from '@/features/events';
import { useT } from '@/features/i18n';
import { trapTab } from '@/lib/focusTrap';
import { calendarColorVars } from '@/ui/theme/calendarColor';

export interface QuickAddProps {
  /** The new event as the tap made it: the day and time, the first visible calendar. */
  readonly initial: Draft;
  readonly calendars: readonly Calendar[];
  /** Already formatted: "Tuesday, October 20, 2026 · 9:00 AM – 10:00 AM". */
  readonly when: string;
  /** Saves; resolves false when it could not (what was typed stays). */
  readonly onSave: (draft: Draft) => Promise<boolean>;
  /** Opens the full editor with what was typed so far. */
  readonly onMore: (draft: Draft) => void;
  readonly onClose: () => void;
}

/**
 * The small card for "just a title" on a wide screen (D-071): the day and time are already known
 * from where the person tapped; Enter saves, and "More options" carries everything typed into
 * the full editor. Text only, never parsed as HTML.
 */
export function QuickAdd({ initial, calendars, when, onSave, onMore, onClose }: QuickAddProps) {
  const t = useT();
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [calendarId, setCalendarId] = useState(initial.calendarId);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const draft: Draft = { ...initial, title: title.trim(), calendarId };
  const calendar = calendars.find((c) => c.id === calendarId);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async (event?: FormEvent): Promise<void> => {
    event?.preventDefault();
    if (busy || draft.title === '') return;
    setBusy(true);
    setFailed(false);
    const ok = await onSave(draft);
    if (!ok) {
      setBusy(false);
      setFailed(true);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.code === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (ref.current) trapTab(ref.current, e.nativeEvent);
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="modal quick"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <form onSubmit={(e) => void submit(e)}>
          <h2 id={titleId} className="sr-only">
            {t('quickAdd')}
          </h2>
          <input
            ref={inputRef}
            type="text"
            className="quick-title"
            aria-label={t('eventTitle')}
            placeholder={t('quickPlaceholder')}
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <p className="quick-when muted">{when}</p>
          <label className="quick-calendar">
            <span
              className="quick-dot"
              aria-hidden="true"
              style={{ background: calendarColorVars(calendar?.color ?? 'gray').bar }}
            />
            <span className="sr-only">{t('calendar')}</span>
            <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {failed && (
            <p role="alert" className="ed-error">
              {t('saveFailed')}
            </p>
          )}
          <div className="ed-foot">
            <button type="button" className="btn" onClick={() => onMore(draft)}>
              {t('quickMore')}
            </button>
            <span className="ed-spacer" />
            <button type="submit" className="btn btn-primary" disabled={busy || draft.title === ''}>
              {t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
