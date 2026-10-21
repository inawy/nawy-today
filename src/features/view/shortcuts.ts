import { useEffect } from 'react';
import type { ViewKind } from './nav';

export type ShortcutAction =
  | { kind: 'today' }
  | { kind: 'previous' }
  | { kind: 'next' }
  | { kind: 'create' }
  | { kind: 'search' }
  | { kind: 'view'; view: ViewKind };

const BY_CODE: Record<string, ShortcutAction> = {
  KeyT: { kind: 'today' },
  KeyP: { kind: 'previous' },
  KeyN: { kind: 'next' },
  KeyC: { kind: 'create' },
  Slash: { kind: 'search' },
  KeyA: { kind: 'view', view: 'agenda' },
  KeyD: { kind: 'view', view: 'day' },
  KeyX: { kind: 'view', view: 'days3' },
  KeyW: { kind: 'view', view: 'week' },
  KeyM: { kind: 'view', view: 'month' },
};

export interface KeyLike {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly defaultPrevented?: boolean;
  /** A DOM event target (or a stand-in with `tagName` / `isContentEditable` in tests). */
  readonly target?: unknown;
}

const TYPING = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

/**
 * Which shortcut a key press means, if any. Keys are matched by `event.code` (the physical key),
 * so they work on an Arabic layout too (D-011). Never fires while typing, with a modifier held, or
 * when something else already handled the event.
 */
export function shortcutFor(event: KeyLike): ShortcutAction | undefined {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return undefined;
  const target = (event.target ?? {}) as { tagName?: unknown; isContentEditable?: unknown };
  if (target.isContentEditable === true) return undefined;
  if (typeof target.tagName === 'string' && TYPING.has(target.tagName)) return undefined;
  return BY_CODE[event.code];
}

/** Listens on the window while `enabled` (turn off while a dialog or the drawer is open). */
export function useShortcuts(enabled: boolean, onAction: (action: ShortcutAction) => void): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent): void => {
      const action = shortcutFor(event);
      if (action) {
        event.preventDefault();
        onAction(action);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onAction]);
}
