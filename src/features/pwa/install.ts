import { useCallback, useEffect, useRef, useState } from 'react';

// "Install app" button. Chromium fires `beforeinstallprompt` when installing is possible; we keep
// the event and offer a button. Where the browser never fires it (Safari/iOS, already installed,
// unsupported) NOTHING is shown: no button we cannot honour (D-027).

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallState {
  readonly canInstall: boolean;
  readonly install: () => void;
}

export function useInstallPrompt(): InstallState {
  const saved = useRef<InstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event): void => {
      event.preventDefault(); // keep it for our own button instead of the browser's mini-bar
      saved.current = event as InstallPromptEvent;
      setCanInstall(true);
    };
    const onInstalled = (): void => {
      saved.current = null;
      setCanInstall(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(() => {
    const event = saved.current;
    if (!event) return;
    saved.current = null; // a prompt can be used once
    setCanInstall(false);
    void event
      .prompt()
      .then(() => event.userChoice)
      .catch(() => undefined);
  }, []);

  return { canInstall, install };
}
