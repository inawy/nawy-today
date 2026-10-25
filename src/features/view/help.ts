import type { MessageKey } from '@/features/i18n';

// What the shortcuts help lists (D-047). Keys are physical keys (`event.code`), shown as the
// letter printed on a standard keyboard, so the list is the same on an Arabic layout.

export interface ShortcutRow {
  /** Each entry is one key cap; entries joined by "+" are pressed together. */
  readonly keys: readonly string[];
  readonly label: MessageKey;
}

export interface ShortcutGroup {
  readonly title: MessageKey;
  readonly rows: readonly ShortcutRow[];
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'scGroupGo',
    rows: [
      { keys: ['T'], label: 'today' },
      { keys: ['P'], label: 'scPrevious' },
      { keys: ['N'], label: 'scNext' },
      { keys: ['A'], label: 'viewAgenda' },
      { keys: ['D'], label: 'viewDay' },
      { keys: ['X'], label: 'viewDays3' },
      { keys: ['W'], label: 'viewWeek' },
      { keys: ['M'], label: 'viewMonth' },
    ],
  },
  {
    title: 'scGroupEvents',
    rows: [
      { keys: ['C'], label: 'scCreate' },
      { keys: ['/'], label: 'search' },
      { keys: ['Shift', '↑ ↓'], label: 'scMove' },
      { keys: ['Shift', '← →'], label: 'scMoveDay' },
      { keys: ['Ctrl', 'Shift', '↑ ↓'], label: 'scResize' },
      { keys: ['Shift', '/'], label: 'scHelp' },
    ],
  },
];
