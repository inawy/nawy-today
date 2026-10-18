import { useEffect } from 'react';

export interface ToastProps {
  readonly message: string;
  /** An action offered inside the toast (e.g. undo). */
  readonly action?: { readonly label: string; readonly run: () => void } | undefined;
  /** How long it stays. The toast never covers anything it cannot be dismissed from. */
  readonly durationMs: number;
  readonly onDismiss: () => void;
}

export function Toast({ message, action, durationMs, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, onDismiss, message]);

  return (
    <div className="toast" role="status">
      <span>{message}</span>
      {action && (
        <button type="button" className="btn toast-action" onClick={action.run}>
          {action.label}
        </button>
      )}
    </div>
  );
}
