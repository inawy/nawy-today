/** A calendar's name as it will be stored: trimmed, single-spaced, never empty. */
export function cleanCalendarName(raw: string, maxLength = 60): string | null {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, maxLength).trim();
  return name === '' ? null : name;
}

/** The first palette colour no live calendar uses yet (or the first one when all are taken). */
export function suggestColor(used: readonly string[], palette: readonly string[]): string {
  return palette.find((c) => !used.includes(c)) ?? palette[0] ?? 'blue';
}
