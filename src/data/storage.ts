// Browsers may evict a site's IndexedDB under storage pressure unless the site asks for
// persistent storage. We ask at startup (D-008) and report the answer honestly, so the UI can
// say plainly when the browser refused.

export type PersistenceResult = 'granted' | 'denied' | 'unsupported';

export interface StorageLike {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
  estimate?: () => Promise<{ quota?: number; usage?: number }>;
}

function defaultStorage(): StorageLike | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.storage;
}

export async function requestPersistence(
  storage: StorageLike | undefined = defaultStorage(),
): Promise<PersistenceResult> {
  if (!storage?.persist) return 'unsupported';
  try {
    if (storage.persisted && (await storage.persisted())) return 'granted';
    return (await storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/** The storage quota in bytes, if the browser reports one. */
export async function getQuotaBytes(
  storage: StorageLike | undefined = defaultStorage(),
): Promise<number | undefined> {
  try {
    return (await storage?.estimate?.())?.quota;
  } catch {
    return undefined;
  }
}
