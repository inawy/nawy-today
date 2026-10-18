// Text normalisation for search (PRODUCT_SPEC 3.6): what people type and what they stored should
// match even when they differ in diacritics, hamza shapes, ta marbuta/ha, ya/alef maqsura,
// tatweel, digit shapes, Latin accents or case. Pure; no locale data, so results are the same
// on every device.

const MAP: Readonly<Record<string, string>> = {
  أ: 'ا',
  إ: 'ا',
  آ: 'ا',
  ٱ: 'ا',
  ؤ: 'و',
  ئ: 'ي',
  ى: 'ي',
  ة: 'ه',
};

// Arabic harakat/Quranic marks (U+064B-065F, U+0670, U+06D6-06ED), tatweel, and invisible direction
// marks that pasted text often carries.
const IGNORED =
  /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const LATIN_MARKS = /[\u0300-\u036F]/g;

function digit(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
  return ch;
}

/** Canonical form used for both the stored text and the query. */
export function normalizeForSearch(text: string): string {
  const folded = text
    .normalize('NFKC')
    .replace(/[أإآٱؤئىة]/g, (c) => MAP[c] ?? c)
    .replace(/[\u0660-\u0669\u06F0-\u06F9]/g, digit)
    .normalize('NFD')
    .replace(IGNORED, '')
    .replace(LATIN_MARKS, '')
    .toLowerCase();
  return folded.replace(/\s+/g, ' ').trim();
}

/** Query words; an event must contain every one of them. */
export function searchTokens(query: string): string[] {
  const n = normalizeForSearch(query);
  return n === '' ? [] : n.split(' ');
}
