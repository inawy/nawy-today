import type { Calendar } from '@/core/model';
import type { IsoWeekday, Numerals } from '@/core/time';
import { useT } from '@/features/i18n';
import type { MessageKey } from '@/features/i18n';
import { useSettings } from '@/features/settings';
import type { Locale, ThemePreference } from '@/features/settings';
import { calendarColorVars } from '@/ui/theme/calendarColor';
import type { FormatOptions, PlainDate } from '@/core/time';
import { EditIcon, PlusIcon } from './Icons';
import { MiniMonth } from './MiniMonth';

export interface SidebarProps {
  readonly calendars: readonly Calendar[];
  readonly onToggleCalendar: (id: string, visible: boolean) => void;
  /** Present only when the browser can install the app right now. */
  readonly onInstall?: (() => void) | undefined;
  readonly onOpenData?: (() => void) | undefined;
  readonly onOpenShortcuts?: (() => void) | undefined;
  /** Lets the person jump to a date from a small month. */
  readonly mini?:
    | {
        readonly anchor: PlainDate;
        readonly today: PlainDate;
        readonly fmt: FormatOptions;
        readonly onPick: (date: PlainDate) => void;
      }
    | undefined;
  readonly onNewCalendar?: (() => void) | undefined;
  readonly onEditCalendar?: ((id: string) => void) | undefined;
  /** Steps for this platform, shown when no install button is possible and the app is not installed yet. */
  readonly installHelp?: 'ios' | 'android' | 'desktop' | null | undefined;
}

const THEMES: readonly [ThemePreference, MessageKey][] = [
  ['auto', 'themeAuto'],
  ['light', 'themeLight'],
  ['dark', 'themeDark'],
];

export function Sidebar({
  calendars,
  onToggleCalendar,
  onInstall,
  onOpenData,
  onOpenShortcuts,
  mini,
  onNewCalendar,
  onEditCalendar,
  installHelp,
}: SidebarProps) {
  const t = useT();
  const { settings, update, persisted } = useSettings();

  return (
    <div className="sidebar-body">
      {mini && <MiniMonth {...mini} weekStart={settings.weekStart} />}
      <section aria-labelledby="calendars-heading">
        <h2 id="calendars-heading" className="sidebar-heading">
          {t('calendars')}
        </h2>
        {calendars.length === 0 ? (
          <p className="muted">{t('noCalendars')}</p>
        ) : (
          <ul className="calendar-list">
            {calendars.map((c) => (
              <li key={c.id}>
                <label className="calendar-row">
                  <input
                    type="checkbox"
                    checked={c.visible}
                    onChange={(e) => onToggleCalendar(c.id, e.currentTarget.checked)}
                  />
                  <span
                    className="calendar-dot"
                    style={{ background: calendarColorVars(c.color).bar }}
                    aria-hidden="true"
                  />
                  <span className="calendar-name">{c.name}</span>
                </label>
                {onEditCalendar && (
                  <button
                    type="button"
                    className="icon-btn calendar-edit"
                    aria-label={t('calendarEditNamed', { name: c.name })}
                    onClick={() => onEditCalendar(c.id)}
                  >
                    <EditIcon />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {onNewCalendar && (
          <button type="button" className="btn calendar-add" onClick={onNewCalendar}>
            <PlusIcon /> {t('calendarAdd')}
          </button>
        )}
      </section>

      <section aria-labelledby="settings-heading" className="sidebar-settings">
        <h2 id="settings-heading" className="sidebar-heading">
          {t('settings')}
        </h2>
        <label className="field">
          <span>{t('language')}</span>
          <select
            value={settings.locale}
            onChange={(e) => {
              const locale = e.currentTarget.value as Locale;
              // Week start follows the language until the user has a setting of their own for it.
              update({ locale, weekStart: locale === 'ar' ? 6 : 1 });
            }}
          >
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="field">
          <span>{t('theme')}</span>
          <select
            value={settings.theme}
            onChange={(e) => update({ theme: e.currentTarget.value as ThemePreference })}
          >
            {THEMES.map(([value, key]) => (
              <option key={value} value={value}>
                {t(key)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('weekStartLabel')}</span>
          <select
            value={settings.weekStart}
            onChange={(e) => update({ weekStart: Number(e.currentTarget.value) as IsoWeekday })}
          >
            <option value={6}>{t('daySaturday')}</option>
            <option value={7}>{t('daySunday')}</option>
            <option value={1}>{t('dayMonday')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('timeFormat')}</span>
          <select
            value={settings.hour12 ? '12' : '24'}
            onChange={(e) => update({ hour12: e.currentTarget.value === '12' })}
          >
            <option value="12">{t('time12')}</option>
            <option value="24">{t('time24')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('numeralsLabel')}</span>
          <select
            value={settings.numerals}
            onChange={(e) => update({ numerals: e.currentTarget.value as Numerals })}
          >
            <option value="latn">{t('numeralsLatin')}</option>
            <option value="arab">{t('numeralsArabic')}</option>
          </select>
        </label>
        <label className="ed-check">
          <input
            type="checkbox"
            checked={settings.hijri}
            onChange={(e) => update({ hijri: e.currentTarget.checked })}
          />
          <span>{t('hijriLabel')}</span>
        </label>
        {onOpenData && (
          <button type="button" className="btn" onClick={onOpenData}>
            {t('dataTitle')}
          </button>
        )}
        {onOpenShortcuts && (
          <button type="button" className="btn shortcuts-btn" onClick={onOpenShortcuts}>
            {t('shortcutsOpen')}
          </button>
        )}
        {onInstall && (
          <button type="button" className="btn" onClick={onInstall}>
            {t('installApp')}
          </button>
        )}
        {!onInstall && installHelp && (
          <details className="install-help">
            <summary>{t('installHow')}</summary>
            <p>
              {t(
                installHelp === 'ios'
                  ? 'installIos'
                  : installHelp === 'android'
                    ? 'installAndroid'
                    : 'installDesktop',
              )}
            </p>
          </details>
        )}
        {!persisted && (
          <p role="status" className="muted">
            {t('notSaved')}
          </p>
        )}
      </section>
    </div>
  );
}
