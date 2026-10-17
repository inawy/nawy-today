import { useCallback, useMemo, useState } from 'react';
import { formatMonthTitle, firstOfMonth, nowMs } from '@/core/time';
import type { FormatOptions } from '@/core/time';
import type { NawyDb } from '@/data';
import { useToday } from '@/features/clock/useToday';
import { DataProvider, useCalendarData, useData } from '@/features/data';
import { useT } from '@/features/i18n';
import { buildMonthModel, monthOf, shiftMonth } from '@/features/month';
import type { MonthRef } from '@/features/month';
import { SettingsProvider, useSettings } from '@/features/settings';
import type { ReadableStorage, WritableStorage } from '@/features/settings';
import { ErrorBoundary } from '@/lib/ErrorBoundary';
import { MonthView } from '@/ui/month/MonthView';
import { LoadingScreen, RecoveryScreen } from '@/ui/RecoveryScreen';
import { Shell } from '@/ui/shell/Shell';

/** How many event rows fit under a day number before "+N" (responsive tuning comes with Phase 6). */
const MAX_LANES = 3;

export interface AppProps {
  /** Injectable for tests; defaults to the real database. */
  readonly create?: () => NawyDb;
  readonly now?: () => number;
  readonly storage?: (ReadableStorage & WritableStorage) | undefined;
}

function browserStorage(): (ReadableStorage & WritableStorage) | undefined {
  try {
    return window.localStorage; // reading the property itself can throw when storage is blocked
  } catch {
    return undefined;
  }
}

export function App({ create, now = nowMs, storage }: AppProps) {
  return (
    <SettingsProvider
      storage={storage ?? browserStorage()}
      languages={navigator.languages}
      root={document.documentElement}
    >
      <ErrorBoundary
        fallback={(_error, reset) => (
          <RecoveryScreen kind="render" retryLabel="reload" onRetry={reset} />
        )}
      >
        <DataProvider {...(create ? { create } : {})}>
          <Calendar now={now} />
        </DataProvider>
      </ErrorBoundary>
    </SettingsProvider>
  );
}

function Calendar({ now }: { readonly now: () => number }) {
  const t = useT();
  const { settings } = useSettings();
  const data = useData();
  const calendarData = useCalendarData();
  const today = useToday(now);
  const [shown, setShown] = useState<MonthRef>(() => monthOf(today));
  const [failed, setFailed] = useState(false);

  const model = useMemo(
    () =>
      buildMonthModel({
        calendars: calendarData.calendars,
        events: calendarData.events,
        year: shown.year,
        month: shown.month,
        weekStart: settings.weekStart,
        maxLanes: MAX_LANES,
      }),
    [calendarData.calendars, calendarData.events, shown, settings.weekStart],
  );

  const toggle = useCallback(
    (id: string, visible: boolean) => {
      void calendarData.toggleCalendar(id, visible).then((ok) => setFailed(!ok));
    },
    [calendarData],
  );

  if (data.status === 'error') return <RecoveryScreen onRetry={data.retry} />;
  if (calendarData.status === 'error') {
    return <RecoveryScreen onRetry={() => window.location.reload()} retryLabel="reload" />;
  }
  if (calendarData.status === 'loading') return <LoadingScreen />;

  const fmt: FormatOptions = { locale: settings.locale, numerals: settings.numerals };
  const count = (n: number) =>
    new Intl.NumberFormat(settings.locale, { numberingSystem: settings.numerals }).format(n);

  return (
    <Shell
      title={formatMonthTitle(firstOfMonth(shown.year, shown.month), fmt)}
      calendars={calendarData.calendars}
      onToggleCalendar={toggle}
      onToday={() => setShown(monthOf(today))}
      onPrevious={() => setShown((m) => shiftMonth(m, -1))}
      onNext={() => setShown((m) => shiftMonth(m, 1))}
    >
      {failed && (
        <p role="status" className="banner">
          {t('actionFailed')}
        </p>
      )}
      {model.skipped > 0 && (
        <p role="status" className="banner">
          {t('skippedRecords', { count: count(model.skipped) })}
        </p>
      )}
      {model.problems.length > 0 && (
        <p role="status" className="banner">
          {t('problemSeries', { count: count(model.problems.length) })}
        </p>
      )}
      <MonthView model={model} today={today} lanes={MAX_LANES} />
    </Shell>
  );
}
