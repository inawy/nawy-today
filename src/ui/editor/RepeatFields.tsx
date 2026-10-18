import type { IsoWeekday } from '@/core/time';
import { formatWeekday } from '@/core/time';
import type { FormatOptions } from '@/core/time';
import type { RepeatDraft, RepeatKind } from '@/features/events';
import { useT } from '@/features/i18n';
import type { MessageKey } from '@/features/i18n';

const KINDS: readonly RepeatKind[] = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
const KIND_LABEL: Record<RepeatKind, MessageKey> = {
  none: 'repeatNone',
  daily: 'repeatDaily',
  weekly: 'repeatWeekly',
  monthly: 'repeatMonthly',
  yearly: 'repeatYearly',
  custom: 'repeatCustom',
};
const UNIT: Record<string, MessageKey> = {
  daily: 'unitDay',
  weekly: 'unitWeek',
  monthly: 'unitMonth',
  yearly: 'unitYear',
};

export interface RepeatFieldsProps {
  readonly value: RepeatDraft;
  readonly onChange: (next: RepeatDraft) => void;
  readonly fmt: FormatOptions;
  /** Weekday order starts on the user's first day of the week. */
  readonly weekStart: IsoWeekday;
}

export function RepeatFields({ value, onChange, fmt, weekStart }: RepeatFieldsProps) {
  const t = useT();
  const kinds: readonly RepeatKind[] = value.kind === 'custom' ? [...KINDS, 'custom'] : KINDS;
  const weekdays = Array.from(
    { length: 7 },
    (_, i) => (((weekStart - 1 + i) % 7) + 1) as IsoWeekday,
  );
  // 2026-10-12 is a Monday: name weekdays through the same formatter as the rest of the app.
  const dayName = (d: IsoWeekday): string =>
    formatWeekday(`2026-10-${String(11 + d).padStart(2, '0')}`, fmt, 'short');

  const toggleDay = (d: IsoWeekday): void => {
    const has = value.weekdays.includes(d);
    onChange({
      ...value,
      weekdays: has ? value.weekdays.filter((x) => x !== d) : [...value.weekdays, d],
    });
  };

  return (
    <fieldset className="ed-group">
      <legend>{t('repeat')}</legend>
      <select
        aria-label={t('repeat')}
        value={value.kind}
        onChange={(e) => onChange({ ...value, kind: e.target.value as RepeatKind })}
      >
        {kinds.map((k) => (
          <option key={k} value={k}>
            {t(KIND_LABEL[k])}
          </option>
        ))}
      </select>

      {value.kind !== 'none' && value.kind !== 'custom' && (
        <>
          <label className="ed-inline">
            <span>{t('every')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              value={Number.isFinite(value.interval) ? value.interval : ''}
              onChange={(e) => onChange({ ...value, interval: e.target.valueAsNumber })}
            />
            <span>{t(UNIT[value.kind] ?? 'unitDay')}</span>
          </label>

          {value.kind === 'weekly' && (
            <div className="ed-days" role="group" aria-label={t('onWeekdays')}>
              {weekdays.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="ed-day"
                  aria-pressed={value.weekdays.includes(d)}
                  onClick={() => toggleDay(d)}
                >
                  {dayName(d)}
                </button>
              ))}
            </div>
          )}

          {value.kind === 'monthly' && (
            <select
              aria-label={t('repeatMonthly')}
              value={value.monthlyMode}
              onChange={(e) =>
                onChange({ ...value, monthlyMode: e.target.value === 'nth' ? 'nth' : 'day' })
              }
            >
              <option value="day">{t('monthlyOnDay')}</option>
              <option value="nth">{t('monthlyOnNth')}</option>
            </select>
          )}

          <select
            aria-label={t('endsNever')}
            value={value.end.kind}
            onChange={(e) => {
              const kind = e.target.value;
              onChange({
                ...value,
                end:
                  kind === 'until'
                    ? { kind: 'until', date: '' }
                    : kind === 'count'
                      ? { kind: 'count', count: 10 }
                      : { kind: 'never' },
              });
            }}
          >
            <option value="never">{t('endsNever')}</option>
            <option value="until">{t('endsOnDate')}</option>
            <option value="count">{t('endsAfterCount')}</option>
          </select>
          {value.end.kind === 'until' && (
            <input
              type="date"
              aria-label={t('endsOnDate')}
              value={value.end.date}
              onChange={(e) => onChange({ ...value, end: { kind: 'until', date: e.target.value } })}
            />
          )}
          {value.end.kind === 'count' && (
            <label className="ed-inline">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={10000}
                aria-label={t('endsAfterCount')}
                value={Number.isFinite(value.end.count) ? value.end.count : ''}
                onChange={(e) =>
                  onChange({ ...value, end: { kind: 'count', count: e.target.valueAsNumber } })
                }
              />
              <span>{t('times')}</span>
            </label>
          )}
        </>
      )}
    </fieldset>
  );
}
