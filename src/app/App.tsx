import { useCallback, useEffect, useMemo, useState } from 'react';
import { datePart, localTimeZone, nowMs } from '@/core/time';
import type { FormatOptions, PlainDate } from '@/core/time';
import type { NawyDb, SnapshotDb } from '@/data';
import type { FileToSave } from '@/features/backup';
import { useNowLocal } from '@/features/clock/useNowLocal';
import { DataProvider, useCalendarData, useData } from '@/features/data';
import { useT } from '@/features/i18n';
import { buildAgendaModel } from '@/features/agenda';
import { createDataTools, latestSnapshotFile, useBackupReminder } from '@/features/backup';
import { useInstallPrompt, useServiceWorker } from '@/features/pwa';
import type { WorkerContainer } from '@/features/pwa';
import { buildSearchIndex } from '@/features/search';
import { buildMonthModel, monthOf } from '@/features/month';
import { SettingsProvider, useSettings } from '@/features/settings';
import type { ReadableStorage, WritableStorage } from '@/features/settings';
import { buildTimeGridModel } from '@/features/timegrid';
import { useEventFlow } from './useEventFlow';
import { shiftAnchor, useShortcuts, useViewMotion, viewTitle, visibleDays } from '@/features/view';
import type { ShortcutAction, ViewKind } from '@/features/view';
import { ErrorBoundary } from '@/lib/ErrorBoundary';
import { useBackLayer } from '@/lib/useBackLayer';
import { MonthView } from '@/ui/month/MonthView';
import { LoadingScreen, RecoveryScreen } from '@/ui/RecoveryScreen';
import { PlusIcon } from '@/ui/shell/Icons';
import { Shell } from '@/ui/shell/Shell';
import { Toast } from '@/ui/editor/Toast';
import { ViewMotion } from '@/ui/shell/ViewMotion';
import { AgendaView } from '@/ui/agenda/AgendaView';
import { DataDialog } from '@/ui/backup/DataDialog';
import { SearchPanel } from '@/ui/search/SearchPanel';
import { TimeGrid } from '@/ui/timegrid/TimeGrid';

/** How many event rows fit under a day number before "+N" (responsive tuning comes with Phase 6). */
const MAX_LANES = 3;
/** All-day rows above the day/week grid before "+N". */
const MAX_ALL_DAY_LANES = 3;

export interface AppProps {
  /** Injectable for tests; defaults to the real database. */
  readonly create?: () => NawyDb;
  readonly createSnapshots?: () => SnapshotDb;
  /** How a produced backup reaches the person; injectable for tests (default: browser download). */
  readonly saveFile?: (file: FileToSave) => void;
  readonly now?: () => number;
  readonly storage?: (ReadableStorage & WritableStorage) | undefined;
  /** The service worker container; injectable for tests. Off in development. */
  readonly serviceWorker?: WorkerContainer | undefined;
}

/** Phones open on the Today list (PRODUCT_SPEC 3.2); wider screens on the month. */
function initialView(): ViewKind {
  try {
    return window.matchMedia?.('(max-width: 599px)').matches ? 'agenda' : 'month';
  } catch {
    return 'month';
  }
}

function browserWorkerContainer(): WorkerContainer | undefined {
  // Development has no worker (it would cache the dev server); builds do.
  if (!import.meta.env.PROD) return undefined;
  return 'serviceWorker' in navigator ? (navigator.serviceWorker as WorkerContainer) : undefined;
}

function browserStorage(): (ReadableStorage & WritableStorage) | undefined {
  try {
    return window.localStorage; // reading the property itself can throw when storage is blocked
  } catch {
    return undefined;
  }
}

export function App({
  create,
  createSnapshots,
  saveFile,
  now = nowMs,
  storage,
  serviceWorker,
}: AppProps) {
  const worker = useMemo(() => serviceWorker ?? browserWorkerContainer(), [serviceWorker]);
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
        <DataProvider
          {...(create ? { create } : {})}
          {...(createSnapshots ? { createSnapshots } : {})}
        >
          <Calendar
            now={now}
            worker={worker}
            storage={storage ?? browserStorage()}
            saveFile={saveFile}
          />
        </DataProvider>
      </ErrorBoundary>
    </SettingsProvider>
  );
}

function Calendar({
  now,
  worker,
  storage,
  saveFile,
}: {
  readonly now: () => number;
  readonly worker: WorkerContainer | undefined;
  readonly storage: (ReadableStorage & WritableStorage) | undefined;
  readonly saveFile: ((file: FileToSave) => void) | undefined;
}) {
  const t = useT();
  const { settings } = useSettings();
  const data = useData();
  const calendarData = useCalendarData();
  const nowLocal = useNowLocal(now);
  const today = datePart(nowLocal);
  const [view, setView] = useState<ViewKind>(initialView);
  const [anchor, setAnchor] = useState<PlainDate>(today);
  const motion = useViewMotion(view, anchor);
  const pwa = useServiceWorker(worker);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const installer = useInstallPrompt();
  const [failed, setFailed] = useState(false);

  const reminder = useBackupReminder({
    storage,
    now,
    eventCount: calendarData.events.filter((e) => e.seriesId === undefined).length,
    enabled: data.status === 'ready' && calendarData.status === 'ready',
  });
  const { markBackedUp } = reminder;
  const tools = useMemo(
    () =>
      data.status === 'ready'
        ? createDataTools({
            db: data.db,
            snapshotDb: data.snapshotDb,
            timeZone: localTimeZone(),
            now,
            onBackup: markBackedUp,
          })
        : undefined,
    [data, now, markBackedUp],
  );

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

  // Built when the panel opens (and when data changes under it), not on every render.
  const searchIndex = useMemo(
    () => (searchOpen ? buildSearchIndex(calendarData.calendars, calendarData.events) : undefined),
    [searchOpen, calendarData.calendars, calendarData.events],
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
      else if (action.kind === 'search') setSearchOpen(true);
      else setView(action.view);
    },
    [goToday, previous, next, flow, anchor],
  );
  useShortcuts(!drawerOpen && !flow.dialogOpen && !searchOpen && !dataOpen, onShortcut);

  // One history entry for "some dialog is open" (so search → editor never pops and re-pushes).
  useBackLayer(flow.dialogOpen || searchOpen || dataOpen, async () => {
    if (flow.dialogOpen) return flow.back();
    if (dataOpen) setDataOpen(false);
    else setSearchOpen(false);
    return true;
  });

  if (data.status === 'error') {
    const { snapshotDb, reset } = data;
    return (
      <RecoveryScreen
        onRetry={data.retry}
        recovery={{
          loadLatestSnapshot: () => latestSnapshotFile(snapshotDb, localTimeZone()),
          reset,
          ...(saveFile ? { save: saveFile } : {}),
        }}
      />
    );
  }
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
      onSearch={() => setSearchOpen(true)}
      onInstall={installer.canInstall ? installer.install : undefined}
      onOpenData={
        tools
          ? () => {
              setDrawerOpen(false);
              setDataOpen(true);
            }
          : undefined
      }
    >
      {pwa.updateReady && !flow.dialogOpen && !searchOpen && (
        <p role="status" className="banner banner-action">
          <span>{t('updateReady')}</span>
          <button type="button" className="btn" onClick={pwa.applyUpdate}>
            {t('updateNow')}
          </button>
        </p>
      )}
      {pwa.offlineReady && !pwa.updateReady && (
        <Toast
          message={t('offlineReady')}
          durationMs={12000}
          onDismiss={pwa.dismissOfflineReady}
          action={{ label: t('dismiss'), run: pwa.dismissOfflineReady }}
        />
      )}
      {reminder.show && !flow.dialogOpen && !searchOpen && !dataOpen && (
        <p role="status" className="banner banner-action">
          <span>{t('reminderText', { days: count(reminder.days) })}</span>
          <span className="banner-buttons">
            <button type="button" className="btn" onClick={() => setDataOpen(true)}>
              {t('reminderNow')}
            </button>
            <button type="button" className="btn" onClick={reminder.dismiss}>
              {t('reminderLater')}
            </button>
          </span>
        </p>
      )}
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
      <ViewMotion motion={motion.kind} tick={motion.tick}>
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
      </ViewMotion>
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
      {dataOpen && tools && data.status === 'ready' && (
        <DataDialog
          tools={tools}
          persistence={data.persistence}
          lastBackupAt={reminder.lastBackupAt}
          {...(saveFile ? { save: saveFile } : {})}
          onClose={() => setDataOpen(false)}
        />
      )}
      {searchOpen && searchIndex && (
        <SearchPanel
          index={searchIndex}
          today={today}
          onOpen={(occurrence) => {
            setSearchOpen(false);
            flow.openEvent(occurrence);
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </Shell>
  );
}
