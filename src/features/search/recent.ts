// Recent searches (D-065): the last few queries that led to opening an event, kept in
// localStorage on this device only. Pure list logic here; storage failures only mean "no list".

export const RECENT_SEARCHES_KEY = 'nawy-today:recent-searches:v1';
export const MAX_RECENT_SEARCHES = 5;
const MAX_QUERY_LENGTH = 80;

const clean = (query: string): string => query.trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH);

/** Puts `query` first, dropping an earlier copy (ignoring case) and keeping at most five. */
export function rememberQuery(list: readonly string[], query: string): readonly string[] {
  const q = clean(query);
  if (q === '') return list;
  const key = q.toLocaleLowerCase();
  const rest = list.filter((item) => item.toLocaleLowerCase() !== key);
  return [q, ...rest].slice(0, MAX_RECENT_SEARCHES);
}

/** Anything unexpected in the stored value yields an empty or shorter list, never an error. */
export function parseRecent(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return [];
  let list: readonly string[] = [];
  for (const item of [...raw].reverse()) {
    if (typeof item === 'string') list = rememberQuery(list, item);
  }
  return list;
}

export interface RecentReadable {
  getItem(key: string): string | null;
}
export interface RecentWritable {
  setItem(key: string, value: string): void;
}

export function loadRecent(storage: RecentReadable | undefined): readonly string[] {
  try {
    const text = storage?.getItem(RECENT_SEARCHES_KEY);
    return parseRecent(text ? JSON.parse(text) : undefined);
  } catch {
    return [];
  }
}

export function saveRecent(storage: RecentWritable | undefined, list: readonly string[]): void {
  try {
    storage?.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
  } catch {
    // Storage refused (full or blocked): the list just lives until the page closes.
  }
}
