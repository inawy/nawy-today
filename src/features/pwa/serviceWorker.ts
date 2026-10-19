import { useCallback, useEffect, useRef, useState } from 'react';

// Offline + update flow (D-027). The worker never replaces itself behind the user's back: a new
// version waits, the app says so, and only the user's "update" tells it to take over. Nothing is
// reloaded while a dialog is open (the caller decides when to offer the button).

/** The part of `ServiceWorkerContainer` this hook needs (so tests can fake it). */
export interface WorkerContainer {
  readonly controller: unknown;
  register(url: string, options?: { scope?: string }): Promise<WorkerRegistration>;
  addEventListener(type: 'controllerchange', listener: () => void): void;
  removeEventListener(type: 'controllerchange', listener: () => void): void;
}

export interface WorkerRegistration {
  readonly waiting: { postMessage(message: unknown): void } | null;
  readonly installing: {
    readonly state: string;
    addEventListener(type: 'statechange', listener: () => void): void;
  } | null;
  readonly active: unknown;
  addEventListener(type: 'updatefound', listener: () => void): void;
  update(): Promise<unknown>;
}

export interface PwaState {
  /** A newer version is installed and waiting for the user's go-ahead. */
  readonly updateReady: boolean;
  /** The app has been cached for the first time: it now works without a connection. */
  readonly offlineReady: boolean;
  readonly applyUpdate: () => void;
  readonly dismissOfflineReady: () => void;
}

const RECHECK_MS = 60 * 60 * 1000;

export function useServiceWorker(container: WorkerContainer | undefined): PwaState {
  const [updateReady, setUpdateReady] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const registration = useRef<WorkerRegistration | null>(null);
  const reloading = useRef(false);

  useEffect(() => {
    if (!container) return;
    let cancelled = false;
    // Was this page already controlled by a worker when it opened? Then a new worker is an
    // UPDATE; if not, the first install just finished ("ready offline").
    const hadController = container.controller !== null && container.controller !== undefined;

    const watchInstalling = (reg: WorkerRegistration): void => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (cancelled || worker.state !== 'installed') return;
        if (hadController || container.controller) setUpdateReady(true);
        else setOfflineReady(true);
      });
    };

    container.register('./sw.js', { scope: './' }).then(
      (reg) => {
        if (cancelled) return;
        registration.current = reg;
        if (reg.waiting && hadController) setUpdateReady(true);
        else if (reg.active && !hadController) setOfflineReady(true);
        reg.addEventListener('updatefound', () => watchInstalling(reg));
        watchInstalling(reg);
      },
      () => {
        // Registration can fail (private mode, blocked): the app simply works online-only.
      },
    );

    const onControllerChange = (): void => {
      // Only our own "update" press may reload the page.
      if (reloading.current) window.location.reload();
    };
    container.addEventListener('controllerchange', onControllerChange);

    const recheck = (): void => {
      void registration.current?.update().catch(() => undefined);
    };
    const timer = window.setInterval(recheck, RECHECK_MS);
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') recheck();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      container.removeEventListener('controllerchange', onControllerChange);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [container]);

  const applyUpdate = useCallback(() => {
    const waiting = registration.current?.waiting;
    if (!waiting) return;
    reloading.current = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });
  }, []);

  const dismissOfflineReady = useCallback(() => setOfflineReady(false), []);
  return { updateReady, offlineReady, applyUpdate, dismissOfflineReady };
}
