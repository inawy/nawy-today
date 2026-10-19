import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { datePart, formatDate, formatTime, fromInstantMs, localTimeZone } from '@/core/time';
import type { FormatOptions, TimeFormatOptions } from '@/core/time';
import { failureMessageKey, summarize } from '@/features/backup';
import type {
  Applied,
  Counts,
  DataTools,
  FileToSave,
  Inspection,
  Mode,
  PersistenceResult,
  SnapshotInfo,
} from '@/features/backup';
import { useT } from '@/features/i18n';
import type { MessageKey } from '@/features/i18n';
import { useSettings } from '@/features/settings';
import { trapTab } from '@/lib/focusTrap';
import { downloadFile } from './download';

export interface DataDialogProps {
  readonly tools: DataTools;
  readonly persistence: PersistenceResult | 'pending';
  /** When a backup file was last made (for the "last backup" line). */
  readonly lastBackupAt: number | undefined;
  readonly onClose: () => void;
  /** Injectable for tests; defaults to a real browser download. */
  readonly save?: (file: FileToSave) => void;
}

type View =
  | { readonly kind: 'home' }
  | { readonly kind: 'preview'; readonly inspection: Inspection; readonly mode: Mode }
  | { readonly kind: 'done'; readonly applied: Applied };

const REASONS: Record<SnapshotInfo['reason'], MessageKey> = {
  daily: 'snapshotDaily',
  'before-import': 'snapshotBeforeImport',
  'before-restore': 'snapshotBeforeRestore',
  manual: 'snapshotManual',
};

const PERSISTENCE: Record<PersistenceResult | 'pending', MessageKey> = {
  granted: 'persistGranted',
  denied: 'persistDenied',
  unsupported: 'persistUnsupported',
  pending: 'persistPending',
};

/** `Blob.text()` where it exists, a FileReader where it does not (older browsers, jsdom). */
function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Export, import with a preview, snapshots and restore, and the state of the storage. */
export function DataDialog({
  tools,
  persistence,
  lastBackupAt,
  onClose,
  save = downloadFile,
}: DataDialogProps) {
  const t = useT();
  const { settings } = useSettings();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View>({ kind: 'home' });
  const [snapshots, setSnapshots] = useState<SnapshotInfo[] | 'loading' | 'unavailable'>('loading');
  const [message, setMessage] = useState<MessageKey | undefined>();
  const [busy, setBusy] = useState(false);

  const tz = localTimeZone();
  const fmt: FormatOptions = { locale: settings.locale, numerals: settings.numerals };
  const timeFmt: TimeFormatOptions = { ...fmt, hour12: settings.hour12 };
  const num = (n: number) =>
    new Intl.NumberFormat(settings.locale, { numberingSystem: settings.numerals }).format(n);
  const when = (ms: number) => {
    const local = fromInstantMs(ms, tz);
    return `${formatDate(datePart(local), fmt, 'medium')} ${formatTime(local, timeFmt)}`;
  };

  const refresh = useCallback(async () => {
    try {
      setSnapshots(await tools.snapshots());
    } catch {
      setSnapshots('unavailable');
    }
  }, [tools]);

  useEffect(() => {
    void refresh();
    dialogRef.current?.focus();
  }, [refresh]);

  const run = async (work: () => Promise<void>, failure: MessageKey): Promise<void> => {
    setBusy(true);
    setMessage(undefined);
    try {
      await work();
    } catch {
      setMessage(failure);
    } finally {
      setBusy(false);
    }
  };

  const exportNow = () =>
    run(async () => {
      const file = await tools.exportFile();
      save(file);
    }, 'exportFailed');

  const openInspection = (outcome: Awaited<ReturnType<DataTools['inspectFile']>>, mode: Mode) => {
    if (outcome.ok) setView({ kind: 'preview', inspection: outcome.inspection, mode });
    else
      setMessage(
        outcome.failure === 'snapshot-missing'
          ? 'importMissing'
          : failureMessageKey(outcome.failure),
      );
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    void run(async () => {
      const text = await readText(file);
      openInspection(await tools.inspectFile(file.name, text, file.size), 'merge');
    }, 'importInvalid');
  };

  const restore = (id: number) =>
    run(async () => openInspection(await tools.inspectSnapshot(id), 'replace'), 'importInvalid');

  const apply = (inspection: Inspection, mode: Mode) =>
    run(async () => {
      const applied = await tools.apply(inspection, mode);
      setView({ kind: 'done', applied });
      await refresh();
    }, 'applyFailed');

  const takeSnapshot = () =>
    run(async () => {
      await tools.saveSnapshot();
      await refresh();
      setMessage('snapshotTaken');
    }, 'exportFailed');

  const downloadSnapshot = (id: number) =>
    run(async () => {
      const file = await tools.snapshotFile(id);
      if (file) save(file);
      else setMessage('importMissing');
    }, 'exportFailed');

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.code === 'Escape') {
      event.stopPropagation();
      if (!busy) onClose();
      return;
    }
    if (dialogRef.current) trapTab(dialogRef.current, event.nativeEvent);
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        ref={dialogRef}
        className="modal data"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className="data-title">
          {t('dataTitle')}
        </h2>

        <div className="data-body">
          {message && (
            <p role="status" className="banner">
              {t(message)}
            </p>
          )}

          {view.kind === 'home' && (
            <>
              <section aria-labelledby={`${titleId}-export`} className="data-section">
                <h3 id={`${titleId}-export`}>{t('exportTitle')}</h3>
                <p className="muted">{t('exportHelp')}</p>
                <p className="muted">
                  {lastBackupAt === undefined
                    ? t('neverBackedUp')
                    : t('lastBackup', { date: when(lastBackupAt) })}
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={exportNow}
                >
                  {t('exportButton')}
                </button>
              </section>

              <section aria-labelledby={`${titleId}-import`} className="data-section">
                <h3 id={`${titleId}-import`}>{t('importTitle')}</h3>
                <p className="muted">{t('importHelp')}</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  tabIndex={-1}
                  data-testid="import-file"
                  onChange={(e) => {
                    onFile(e.currentTarget.files?.[0]);
                    e.currentTarget.value = '';
                  }}
                />
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  {t('importChoose')}
                </button>
              </section>

              <section aria-labelledby={`${titleId}-snaps`} className="data-section">
                <h3 id={`${titleId}-snaps`}>{t('snapshotsTitle')}</h3>
                <p className="muted">{t('snapshotsHelp')}</p>
                {snapshots === 'unavailable' ? (
                  <p role="status" className="muted">
                    {t('snapshotsUnavailable')}
                  </p>
                ) : (
                  <>
                    <button type="button" className="btn" disabled={busy} onClick={takeSnapshot}>
                      {t('snapshotNow')}
                    </button>
                    {snapshots !== 'loading' && snapshots.length === 0 && (
                      <p className="muted">{t('snapshotNone')}</p>
                    )}
                    {snapshots !== 'loading' && snapshots.length > 0 && (
                      <ul className="snapshot-list">
                        {snapshots.map((s) => (
                          <li key={s.id} className="snapshot-row">
                            <span className="snapshot-info">
                              <span>{when(s.createdAt)}</span>
                              <span className="muted">
                                {t(REASONS[s.reason])} ·{' '}
                                {num(Math.max(1, Math.round(s.bytes / 1024)))} KB
                              </span>
                            </span>
                            <button
                              type="button"
                              className="btn"
                              disabled={busy}
                              onClick={() => void restore(s.id)}
                            >
                              {t('snapshotRestore')}
                            </button>
                            <button
                              type="button"
                              className="btn"
                              disabled={busy}
                              onClick={() => void downloadSnapshot(s.id)}
                            >
                              {t('snapshotDownload')}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </section>

              <section aria-labelledby={`${titleId}-storage`} className="data-section">
                <h3 id={`${titleId}-storage`}>{t('storageTitle')}</h3>
                <p role="status" className="muted">
                  {t(PERSISTENCE[persistence])}
                </p>
              </section>
            </>
          )}

          {view.kind === 'preview' && (
            <Preview
              inspection={view.inspection}
              mode={view.mode}
              busy={busy}
              num={num}
              when={when}
              onMode={(mode) => setView({ ...view, mode })}
              onBack={() => {
                setMessage(undefined);
                setView({ kind: 'home' });
              }}
              onApply={() => void apply(view.inspection, view.mode)}
            />
          )}

          {view.kind === 'done' && (
            <section className="data-section">
              <p role="status">
                {t('applyDone', {
                  added: num(view.applied.events.added),
                  updated: num(view.applied.events.updated),
                  removed: num(view.applied.events.removed),
                })}
              </p>
              {view.applied.orphaned > 0 && (
                <p role="status" className="muted">
                  {t('applyOrphans', { count: num(view.applied.orphaned) })}
                </p>
              )}
              <p className="muted">{t('previewSafety')}</p>
            </section>
          )}
        </div>

        <div className="ed-foot">
          <span className="ed-spacer" />
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Preview({
  inspection,
  mode,
  busy,
  num,
  when,
  onMode,
  onBack,
  onApply,
}: {
  readonly inspection: Inspection;
  readonly mode: Mode;
  readonly busy: boolean;
  readonly num: (n: number) => string;
  readonly when: (ms: number) => string;
  readonly onMode: (mode: Mode) => void;
  readonly onBack: () => void;
  readonly onApply: () => void;
}) {
  const t = useT();
  const name = useId();
  const summary = summarize(inspection, mode);
  const { source } = inspection;
  const sourceText =
    source.kind === 'file'
      ? t('sourceFile', { name: source.name })
      : t('sourceSnapshot', { date: when(source.createdAt) });

  const row = (label: MessageKey, c: Counts) => (
    <tr>
      <th scope="row">{t(label)}</th>
      <td>{num(c.added)}</td>
      <td>{num(c.updated)}</td>
      <td>{num(c.removed)}</td>
      <td>{num(c.same)}</td>
    </tr>
  );

  return (
    <section className="data-section" aria-label={t('previewTitle')}>
      <h3>{t('previewTitle')}</h3>
      <p className="muted">{t('previewSource', { source: sourceText })}</p>

      <fieldset className="data-modes">
        <label className="data-mode">
          <input
            type="radio"
            name={name}
            checked={mode === 'merge'}
            onChange={() => onMode('merge')}
          />
          <span>
            <strong>{t('modeMerge')}</strong>
            <span className="muted">{t('modeMergeHelp')}</span>
          </span>
        </label>
        <label className="data-mode">
          <input
            type="radio"
            name={name}
            checked={mode === 'replace'}
            onChange={() => onMode('replace')}
          />
          <span>
            <strong>{t('modeReplace')}</strong>
            <span className="muted">{t('modeReplaceHelp')}</span>
          </span>
        </label>
      </fieldset>

      <table className="data-counts">
        <thead>
          <tr>
            <td />
            <th scope="col">{t('countAdded')}</th>
            <th scope="col">{t('countUpdated')}</th>
            <th scope="col">{t('countRemoved')}</th>
            <th scope="col">{t('countSame')}</th>
          </tr>
        </thead>
        <tbody>
          {row('previewCalendars', summary.calendars)}
          {row('previewEvents', summary.events)}
        </tbody>
      </table>

      <p className="muted">{t('previewSafety')}</p>
      <div className="data-actions">
        <button type="button" className="btn" disabled={busy} onClick={onBack}>
          {t('back')}
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onApply}>
          {t('apply')}
        </button>
      </div>
    </section>
  );
}
