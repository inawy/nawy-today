// iCalendar (RFC 5545) text plumbing: line folding, content lines, text escaping. Pure.

export interface ContentLine {
  readonly name: string;
  readonly params: Readonly<Record<string, string>>;
  readonly value: string;
}

/** Joins folded lines (a line starting with a space or tab continues the previous one). */
export function unfold(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/^﻿/, '').split(/\r\n|\n|\r/)) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += raw.slice(1);
    } else {
      out.push(raw);
    }
  }
  return out.filter((l) => l !== '');
}

/** `NAME;P=V;Q="x;y":value` → parts. Returns undefined for a line with no colon. */
export function parseContentLine(line: string): ContentLine | undefined {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === ':' && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 1) return undefined;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);

  const parts: string[] = [];
  let current = '';
  quoted = false;
  for (const c of head) {
    if (c === '"') quoted = !quoted;
    if (c === ';' && !quoted) {
      parts.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  parts.push(current);

  const name = (parts[0] ?? '').toUpperCase();
  if (name === '') return undefined;
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq < 1) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

export function unescapeText(value: string): string {
  return value.replace(/\\([\;,nN])/g, (_m, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const utf8Length = (cp: number): number => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/** Folds a line to at most 75 octets per physical line, never splitting a character. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = '';
  let size = 0;
  let limit = 75;
  for (const ch of line) {
    const n = utf8Length(ch.codePointAt(0) ?? 0);
    if (size + n > limit) {
      out.push(current);
      current = '';
      size = 0;
      limit = 74; // the leading space of a continuation line counts too
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join('\r\n ');
}
