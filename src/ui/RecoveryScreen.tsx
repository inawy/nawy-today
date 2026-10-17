import { useT } from '@/features/i18n';

export interface RecoveryScreenProps {
  readonly onRetry: () => void;
  /** Show the generic message instead of the "your data could not be opened" one. */
  readonly kind?: 'data' | 'render';
  readonly retryLabel?: 'retry' | 'reload';
}

/** Shown instead of a blank page. Says plainly what failed and what is (not) known. */
export function RecoveryScreen({
  onRetry,
  kind = 'data',
  retryLabel = 'retry',
}: RecoveryScreenProps) {
  const t = useT();
  return (
    <div className="center-screen" role="alert">
      <h1>{t(kind === 'data' ? 'loadError' : 'somethingWrong')}</h1>
      {kind === 'data' && <p className="muted">{t('loadErrorHelp')}</p>}
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        {t(retryLabel)}
      </button>
    </div>
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
