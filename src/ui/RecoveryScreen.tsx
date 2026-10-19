import { useState } from 'react';
import type { FileToSave } from '@/features/backup';
import { useT } from '@/features/i18n';
import type { MessageKey } from '@/features/i18n';
import { downloadFile } from '@/ui/backup/download';

/** What the recovery screen can do when the data cannot be opened (D-028). */
export interface DataRecovery {
  /** The newest snapshot as a file, or undefined when there is none. May reject. */
  readonly loadLatestSnapshot: () => Promise<FileToSave | undefined>;
  /** Deletes the unopenable data and starts empty. Resolves false when it could not. */
  readonly reset: () => Promise<boolean>;
  /** Injectable for tests; defaults to a real browser download. */
  readonly save?: (file: FileToSave) => void;
}

export interface RecoveryScreenProps {
  readonly onRetry: () => void;
  /** Show the generic message instead of the "your data could not be opened" one. */
  readonly kind?: 'data' | 'render';
  readonly retryLabel?: 'retry' | 'reload';
  readonly recovery?: DataRecovery;
}

/** Shown instead of a blank page. Says plainly what failed and what is (not) known. */
export function RecoveryScreen({
  onRetry,
  kind = 'data',
  retryLabel = 'retry',
  recovery,
}: RecoveryScreenProps) {
  const t = useT();
  return (
    <div className="center-screen" role="alert">
      <h1>{t(kind === 'data' ? 'loadError' : 'somethingWrong')}</h1>
      {kind === 'data' && <p className="muted">{t('loadErrorHelp')}</p>}
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        {t(retryLabel)}
      </button>
      {kind === 'data' && recovery && <RecoveryActions recovery={recovery} />}
    </div>
  );
}

function RecoveryActions({ recovery }: { readonly recovery: DataRecovery }) {
  const t = useT();
  const [message, setMessage] = useState<MessageKey | undefined>();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = recovery.save ?? downloadFile;

  const downloadSnapshot = async (): Promise<void> => {
    setBusy(true);
    try {
      const file = await recovery.loadLatestSnapshot();
      if (file) save(file);
      else setMessage('recoveryNoSnapshot');
    } catch {
      setMessage('recoveryNoSnapshot');
    } finally {
      setBusy(false);
    }
  };

  const reset = async (): Promise<void> => {
    setBusy(true);
    try {
      if (!(await recovery.reset())) setMessage('recoveryResetFailed');
    } catch {
      setMessage('recoveryResetFailed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="recovery-actions" aria-label={t('recoveryTitle')}>
      <button type="button" className="btn" disabled={busy} onClick={() => void downloadSnapshot()}>
        {t('recoverySnapshot')}
      </button>
      {!confirming ? (
        <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(true)}>
          {t('recoveryReset')}
        </button>
      ) : (
        <>
          <p className="muted">{t('recoveryResetWarn')}</p>
          <button type="button" className="btn" disabled={busy} onClick={() => void reset()}>
            {t('recoveryResetConfirm')}
          </button>
        </>
      )}
      {message && (
        <p role="status" className="muted">
          {t(message)}
        </p>
      )}
    </section>
  );
}

export function LoadingScreen() {
  const t = useT();
  return (
    <div className="center-screen" role="status" aria-busy="true">
      <p className="muted">{t('loading')}</p>
    </div>
  );
}
