import { useCallback, useMemo, useState } from 'react';
import { datePart, nowMs } from '@/core/time';
import type { FormatOptions, PlainDate } from '@/core/time';
import type { NawyDb } from '@/data';
import { useNowLocal } from '@/features/clock/useNowLocal';
import { DataProvider, useCalendarData, useData } from '@/features/data';
import { useT } from '@/features/i18n';
import { buildAgendaModel } from '@/features/agenda';
import { buildMonthModel, monthOf } from '@/features/month';
import { SettingsProvider, useSettings } from '@/features/settings';
import type { ReadableStorage, WritableStorage } from '@/features/settings';
import { buildTimeGridModel } from '@/features/timegrid';
import { useEventFlow } from './useEventFlow';
import { shiftAnchor, useShortcuts, viewTitle, visibleDays } from '@/features/view';
import type { ShortcutAction, ViewKind } from '@/features/view';
import { ErrorBoundary } from '@/lib/ErrorBoundary';
import { MonthView } from '@/ui/month/MonthView';
import { LoadingScreen, RecoveryScreen } from '@/ui/RecoveryScreen';
import { PlusIcon } from '@/ui/shell/Icons';
import { Shell } from '@/ui/shell/Shell';
import { AgendaView } from '@/ui/agenda/AgendaView';
import { TimeGrid } from '@/ui/timegrid/TimeGrid';

/** How many event rows fit under a day number before "+N" (responsive tuning comes with Phase 6). */
const MAX_LANES = 3;
/** All-day rows above the day/week grid before "+N". */
const MAX_ALL_DAY_LANES = 3;

export interface AppProps {
  /** Injectable for tests; defaults to the real database. */
  readonly create?: () => NawyDb;
  readonly now?: () => number;
  readonly storage?: (ReadableStorage & WritableStorage) | undefined;
}

/** Phones open on the Today list (PRODUCT_SPEC 3.2); wider screens on the month. */
function initialView(): ViewKind {
  try {
    return window.matchMedia?.('(max-width: 599px)').matches ? 'agenda' : 'month';
  } catch {
    return 'month';
  }
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
  const nowLocal = useNowLocal(now);
  const today = datePart(nowLocal);
  const [view, setView] = useState<ViewKind>(initialView);
  const [anchor, setAnchor] = useState<PlainDate>(today);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  const fmt: FormatOptions = { locale: settings.locale, numerals: settings.numerals };

  const flow = useEventFlow({
    store: data.status === 'ready' ? data.store : undefined,
    calendars: calendarData.calendars,
    events: calendarData.events,
    fmt,
    weekStart: settings.weekStart,
  });

  const monthModel = useMemo(() => {
    const { year, month } = monthOf(anchor);
    return buildMonthModel({
      calendars: calendarData.calendars,
      events: calendarData.events,
      year,
      month,
      weekStart: settings.weekStart,
      maxLanes: MAX_LANES,
    });
  }, [calendarData.calendars, calendarData.events, anchor, settings.weekStart]);

  const gridModel = useMemo(
    () =>
      buildTimeGridModel({
        calendars: calendarData.calendars,
        events: calendarData.events,
        days:
          view === 'day' || view === 'week' ? visibleDays(view, anchor, settings.weekStart) : [],
        maxAllDayLanes: MAX_ALL_DAY_LANES,
      }),
    [calendarData.calendars, calendarData.events, view, anchor, settings.weekStart],
  );

  const agendaModel = useMemo(
    () =>
      buildAgendaModel({
        calendars: calendarData.calendars,
        events: calendarData.events,
        date: anchor,
        nowLocal,
      }),
    [calendarData.calendars, calendarData.events, anchor, nowLocal],
  );

  const toggle = useCallback(
    (id: string, visible: boolean) => {
      void calendarData.toggleCalendar(id, visible).then((ok) => setFailed(!ok));
    },
    [calendarData],
  );

  const goToday = useCallback(() => setAnchor(today), [today]);
  const previous = useCallback(() => setAnchor((a) => shiftAnchor(view, a, -1)), [view]);
  const next = useCallback(() => setAnchor((a) => shiftAnchor(view, a, 1)), [view]);
  const openDay = useCallback((date: PlainDate) => {
    setAnchor(date);
    setView('day');
  }, []);

  const onShortcut = useCallback(
    (action: ShortcutAction) => {
      if (action.kind === 'today') goToday();
      else if (action.kind === 'previous') previous();
      else if (action.kind === 'next') next();
      else if (action.kind === 'create') flow.openNew(anchor);
      else setView(action.view);
    },
    [goToday, previous, next, flow, anchor],
  );
  useShortcuts(!drawerOpen && !flow.dialogOpen, onShortcut);

  if (data.status === 'error') return <RecoveryScreen onRetry={data.retry} />;
  if (calendarData.status === 'error') {
    return <RecoveryScreen onRetry={() => window.location.reload()} retryLabel="reload" />;
  }
  if (calendarData.status === 'loading') return <LoadingScreen />;

  const count = (n: number) =>
    new Intl.NumberFormat(settings.locale, { numberingSystem: settings.numerals }).format(n);
  const active = view === 'month' ? monthModel : view === 'agenda' ? agendaModel : gridModel;
  const skipped = active.skipped;
  const problems = active.problems;

  return (
    <Shell
      title={viewTitle(view, anchor, settings.weekStart, fmt)}
      view={view}
      onView={setView}
      drawerOpen={drawerOpen}
      onDrawerOpenChange={setDrawerOpen}
      calendars={calendarData.calendars}
      onToggleCalendar={toggle}
      onToday={goToday}
      onPrevious={previous}
      onNext={next}
    >
      {failed && (
        <p role="status" className="banner">
          {t('actionFailed')}
        </p>
      )}
      {skipped > 0 && (
        <p role="status" className="banner">
          {t('skippedRecords', { count: count(skipped) })}
        </p>
      )}
      {problems.length > 0 && (
        <p role="status" className="banner">
          {t('problemSeries', { count: count(problems.length) })}
        </p>
      )}
      {view === 'agenda' ? (
        <AgendaView model={agendaModel} nowLocal={nowLocal} onOpenEvent={flow.openEvent} />
      ) : view === 'month' ? (
        <MonthView
          model={monthModel}
          today={today}
          lanes={MAX_LANES}
          onOpenDay={openDay}
          onOpenEvent={flow.openEvent}
        />
      ) : (
        <TimeGrid
          key={view}
          model={gridModel}
          today={today}
          nowLocal={nowLocal}
          lanes={MAX_ALL_DAY_LANES}
          onOpenDay={view === 'week' ? openDay : undefined}
          onOpenEvent={flow.openEvent}
          onCreateAt={flow.openNew}
        />
      )}
      <button
        type="button"
        className="fab"
        aria-label={t('addEvent')}
        title={t('addEvent')}
        onClick={() => flow.openNew(anchor)}
      >
        <PlusIcon />
      </button>
      {flow.overlay}
    </Shell>
  );
}
