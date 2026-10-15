import type { IsoWeekday, Numerals } from '@/core/time';

// User settings: small, local, validated on the way in. A corrupt or foreign value in storage
// never breaks the app: each field falls back to its default on its own.

export type Locale = 'ar' | 'en';
export type ThemePreference = 'auto' | 'light' | 'dark';

export interface Settings {
  readonly locale: Locale;
  readonly theme: ThemePreference;
  readonly weekStart: IsoWeekday;
  readonly hour12: boolean;
  /** Show the Hijri date as a small secondary line (display only, D-016). */
  readonly hijri: boolean;
  readonly numerals: Numerals;
}

export const SETTINGS_KEY = 'nawy-today:settings:v1';

/** Arabic-first: English only when the browser's first language is English. */
export function detectLocale(languages: readonly string[] | undefined): Locale {
  const first = languages?.[0]?.toLowerCase() ?? '';
  return first.startsWith('en') ? 'en' : 'ar';
}

export function defaultSettings(locale: Locale): Settings {
  return {
    locale,
    theme: 'auto',
    weekStart: locale === 'ar' ? 6 : 1, // D-016: Saturday for Arabic, Monday for English
    hour12: true,
    hijri: false,
    numerals: 'latn',
  };
}

const isOneOf = <T extends string>(value: unknown, allowed: readonly T[]): value is T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value);

export function parseSettings(raw: unknown, fallbackLocale: Locale): Settings {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const locale = isOneOf(o['locale'], ['ar', 'en'] as const) ? o['locale'] : fallbackLocale;
  const d = defaultSettings(locale);
  const weekStart = o['weekStart'];
  return {
    locale,
    theme: isOneOf(o['theme'], ['auto', 'light', 'dark'] as const) ? o['theme'] : d.theme,
    weekStart:
      typeof weekStart === 'number' &&
      Number.isInteger(weekStart) &&
      weekStart >= 1 &&
      weekStart <= 7
        ? (weekStart as IsoWeekday)
        : d.weekStart,
    hour12: typeof o['hour12'] === 'boolean' ? o['hour12'] : d.hour12,
    hijri: typeof o['hijri'] === 'boolean' ? o['hijri'] : d.hijri,
    numerals: isOneOf(o['numerals'], ['latn', 'arab'] as const) ? o['numerals'] : d.numerals,
  };
}

export interface ReadableStorage {
  getItem(key: string): string | null;
}
export interface WritableStorage {
  setItem(key: string, value: string): void;
}

export function loadSettings(
  storage: ReadableStorage | undefined,
  languages: readonly string[] | undefined,
): Settings {
  const fallback = detectLocale(languages);
  try {
    const text = storage?.getItem(SETTINGS_KEY);
    return parseSettings(text ? JSON.parse(text) : undefined, fallback);
  } catch {
    return defaultSettings(fallback);
  }
}

/** `false` when the browser refuses (private mode, quota): the caller can say so honestly. */
export function saveSettings(storage: WritableStorage | undefined, settings: Settings): boolean {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return storage !== undefined;
  } catch {
    return false;
  }
}

/** Direction, language and theme on the document element. */
export function applyToDocument(root: HTMLElement, settings: Settings): void {
  root.lang = settings.locale;
  root.dir = settings.locale === 'ar' ? 'rtl' : 'ltr';
  if (settings.theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', settings.theme);
}
