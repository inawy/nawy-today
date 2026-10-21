import type { Calendar } from '@/core/model';
import { useT } from '@/features/i18n';
import type { MessageKey } from '@/features/i18n';
import { useSettings } from '@/features/settings';
import type { Locale, ThemePreference } from '@/features/settings';
import { calendarColorVars } from '@/ui/theme/calendarColor';

export interface SidebarProps {
  readonly calendars: readonly Calendar[];
  readonly onToggleCalendar: (id: string, visible: boolean) => void;
  /** Present only when the browser can install the app right now. */
  readonly onInstall?: (() => void) | undefined;
  readonly onOpenData?: (() => void) | undefined;
  /** Steps for this platform, shown when no install button is possible and the app is not installed yet. */
  readonly installHelp?: 'ios' | 'android' | 'desktop' | null | undefined;
}

const THEMES: readonly [ThemePreference, MessageKey][] = [
  ['auto', 'themeAuto'],
  ['light', 'themeLight'],
  ['dark', 'themeDark'],
];

export function Sidebar({ calendars, onToggleCalendar, onInstall, onOpenData, installHelp }: SidebarProps) {
  const t = useT();
  const { settings, update, persisted } = useSettings();

  return (
    <div className="sidebar-body">
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
              </li>
            ))}
          </ul>
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
        {onOpenData && (
          <button type="button" className="btn" onClick={onOpenData}>
            {t('dataTitle')}
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
