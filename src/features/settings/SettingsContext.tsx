import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { applyToDocument, loadSettings, saveSettings } from './settings';
import type { ReadableStorage, Settings, WritableStorage } from './settings';

interface SettingsApi {
  readonly settings: Settings;
  readonly update: (patch: Partial<Settings>) => void;
  /** False when the browser would not keep the change (it still applies for this session). */
  readonly persisted: boolean;
}

const SettingsContext = createContext<SettingsApi | undefined>(undefined);

export interface SettingsProviderProps {
  readonly children: ReactNode;
  readonly storage?: (ReadableStorage & WritableStorage) | undefined;
  readonly languages?: readonly string[] | undefined;
  readonly root?: HTMLElement | undefined;
}

export function SettingsProvider({ children, storage, languages, root }: SettingsProviderProps) {
  const [settings, setSettings] = useState(() => loadSettings(storage, languages));
  const [persisted, setPersisted] = useState(true);

  useEffect(() => {
    if (root) applyToDocument(root, settings);
  }, [root, settings]);

  const update = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((current) => {
        const next = { ...current, ...patch };
        setPersisted(saveSettings(storage, next));
        return next;
      });
    },
    [storage],
  );

  const value = useMemo(() => ({ settings, update, persisted }), [settings, update, persisted]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsApi {
  const api = useContext(SettingsContext);
  if (!api) throw new Error('useSettings must be used inside <SettingsProvider>');
  return api;
}
