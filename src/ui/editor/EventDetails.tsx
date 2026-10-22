import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { Calendar, CalEvent } from '@/core/model';
import { useT } from '@/features/i18n';
import { trapTab } from '@/lib/focusTrap';
import { CloseIcon } from '@/ui/shell/Icons';
import { calendarColorVars } from '@/ui/theme/calendarColor';

export interface EventDetailsProps {
  readonly event: CalEvent;
  readonly calendar: Calendar | undefined;
  /** Already formatted: "Tuesday, October 20, 2026 · 9:00 AM – 10:00 AM". */
  readonly when: string;
  readonly recurring: boolean;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onClose: () => void;
}

/** What an event is, at a glance, before deciding to change it. Text only: never parsed as HTML. */
export function EventDetails({
  event,
  calendar,
  when,
  recurring,
  onEdit,
  onDelete,
  onClose,
}: EventDetailsProps) {
  const t = useT();
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const title = event.title.trim() === '' ? t('untitled') : event.title;

  useEffect(() => {
    editRef.current?.focus();
  }, []);

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
        className="modal details"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <div className="ed-head">
          <span
            className="details-bar"
            style={{ background: calendarColorVars(calendar?.color ?? 'gray').bar }}
            aria-hidden="true"
          />
          <h2 id={titleId} className="details-title">
            {title}
          </h2>
          <button type="button" className="icon-btn" aria-label={t('close')} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <dl className="details-body">
          <div>
            <dt>{t('when')}</dt>
            <dd>
              {when}
              {recurring && <span className="details-chip">{t('detailsRepeats')}</span>}
            </dd>
          </div>
          {event.location && (
            <div>
              <dt>{t('location')}</dt>
              <dd>{event.location}</dd>
            </div>
          )}
          {calendar && (
            <div>
              <dt>{t('calendar')}</dt>
              <dd>{calendar.name}</dd>
            </div>
          )}
          {event.notes && (
            <div>
              <dt>{t('notes')}</dt>
              <dd className="details-notes">{event.notes}</dd>
            </div>
          )}
        </dl>
        <footer className="ed-foot">
          <button ref={editRef} type="button" className="btn btn-primary" onClick={onEdit}>
            {t('editEvent')}
          </button>
          <button type="button" className="btn btn-danger" onClick={onDelete}>
            {t('delete')}
          </button>
        </footer>
      </div>
    </div>
  );
}
