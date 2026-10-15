import type { IsoWeekday } from '@/core/time';
import { epochDayOf } from '@/core/time';

// The supported RRULE subset (D-007, D-021). Anything else is REJECTED with a reason — never
// silently approximated — so the UI can only offer what the engine honestly expands.

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface ByDay {
  readonly day: IsoWeekday;
  /** 1…5 or -1…-5: the n-th such weekday of the month. Absent = every such weekday. */
  readonly nth?: number;
}

export interface Rule {
  readonly freq: Freq;
  readonly interval: number;
  readonly byDay: readonly ByDay[];
  readonly byMonthDay: readonly number[];
  readonly byMonth: readonly number[];
  readonly count?: number;
  /** `YYYY-MM-DD` (all-day) or `YYYY-MM-DDTHH:mm` (floating, no zone). Inclusive. */
  readonly until?: string;
  readonly wkst: IsoWeekday;
}

export type ParseResult = { ok: true; rule: Rule } | { ok: false; error: string };

export const MAX_INTERVAL = 1000;
export const MAX_COUNT = 10000;

const DAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
const FREQS: readonly string[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const KNOWN = ['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'WKST'];

const fail = (error: string): ParseResult => ({ ok: false, error });

function dayOf(code: string): IsoWeekday | undefined {
  const i = DAY_CODES.indexOf(code as (typeof DAY_CODES)[number]);
  return i < 0 ? undefined : ((i + 1) as IsoWeekday);
}

function int(text: string): number | undefined {
  return /^[+-]?\d+$/.test(text) ? Number(text) : undefined;
}

const uniqueSorted = (values: number[]): number[] => [...new Set(values)].sort((a, b) => a - b);

function parseUntil(text: string): string | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?$/.exec(text);
  if (!m) return undefined;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (epochDayOf(date) === undefined) return undefined;
  if (m[4] === undefined) return date;
  const h = Number(m[4]);
  const min = Number(m[5]);
  if (h > 23 || min > 59 || Number(m[6]) > 59) return undefined;
  return `${date}T${m[4]}:${m[5]}`;
}

export function parseRule(text: string): ParseResult {
  const body = text.trim().replace(/^RRULE:/i, '');
  if (body === '') return fail('empty rule');

  const parts = new Map<string, string>();
  for (const piece of body.split(';')) {
    const eq = piece.indexOf('=');
    if (eq <= 0) return fail(`malformed part "${piece}"`);
    const key = piece.slice(0, eq).toUpperCase();
    const value = piece.slice(eq + 1).toUpperCase();
    if (!KNOWN.includes(key)) return fail(`unsupported part ${key}`);
    if (parts.has(key)) return fail(`duplicate part ${key}`);
    if (value === '') return fail(`empty value for ${key}`);
    parts.set(key, value);
  }

  const freqText = parts.get('FREQ');
  if (freqText === undefined) return fail('FREQ is required');
  if (!FREQS.includes(freqText)) return fail(`unsupported FREQ ${freqText}`);
  const freq = freqText as Freq;

  let interval = 1;
  const intervalText = parts.get('INTERVAL');
  if (intervalText !== undefined) {
    const n = int(intervalText);
    if (n === undefined || n < 1 || n > MAX_INTERVAL)
      return fail(`INTERVAL must be 1…${MAX_INTERVAL}`);
    interval = n;
  }

  let count: number | undefined;
  const countText = parts.get('COUNT');
  if (countText !== undefined) {
    const n = int(countText);
    if (n === undefined || n < 1 || n > MAX_COUNT) return fail(`COUNT must be 1…${MAX_COUNT}`);
    count = n;
  }

  let until: string | undefined;
  const untilText = parts.get('UNTIL');
  if (untilText !== undefined) {
    until = parseUntil(untilText);
    if (until === undefined) {
      return fail('UNTIL must be YYYYMMDD or YYYYMMDDTHHMMSS (floating, without Z)');
    }
  }
  if (count !== undefined && until !== undefined) return fail('COUNT and UNTIL cannot be combined');

  let wkst: IsoWeekday = 1;
  const wkstText = parts.get('WKST');
  if (wkstText !== undefined) {
    const d = dayOf(wkstText);
    if (d === undefined) return fail(`invalid WKST ${wkstText}`);
    wkst = d;
  }

  const byMonth: number[] = [];
  const byMonthText = parts.get('BYMONTH');
  if (byMonthText !== undefined) {
    for (const item of byMonthText.split(',')) {
      const n = int(item);
      if (n === undefined || n < 1 || n > 12) return fail(`invalid BYMONTH ${item}`);
      byMonth.push(n);
    }
  }

  const byMonthDay: number[] = [];
  const byMonthDayText = parts.get('BYMONTHDAY');
  if (byMonthDayText !== undefined) {
    if (freq === 'WEEKLY') return fail('BYMONTHDAY is not allowed with FREQ=WEEKLY');
    for (const item of byMonthDayText.split(',')) {
      const n = int(item);
      if (n === undefined || n === 0 || Math.abs(n) > 31) return fail(`invalid BYMONTHDAY ${item}`);
      byMonthDay.push(n);
    }
  }

  const byDay: ByDay[] = [];
  const byDayText = parts.get('BYDAY');
  if (byDayText !== undefined) {
    const ordinalsOk = freq === 'MONTHLY' || (freq === 'YEARLY' && byMonth.length > 0);
    for (const item of byDayText.split(',')) {
      const m = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(item);
      const day = m ? dayOf(m[2] ?? '') : undefined;
      if (!m || day === undefined) return fail(`invalid BYDAY ${item}`);
      if (m[1] === undefined) {
        byDay.push({ day });
        continue;
      }
      const nth = Number(m[1]);
      if (nth === 0 || Math.abs(nth) > 5) return fail(`invalid BYDAY ordinal ${item}`);
      if (!ordinalsOk) {
        return fail('BYDAY ordinals need FREQ=MONTHLY, or FREQ=YEARLY together with BYMONTH');
      }
      byDay.push({ day, nth });
    }
    byDay.sort((a, b) => a.day - b.day || (a.nth ?? 0) - (b.nth ?? 0));
  }

  return {
    ok: true,
    rule: {
      freq,
      interval,
      byDay,
      byMonthDay: uniqueSorted(byMonthDay),
      byMonth: uniqueSorted(byMonth),
      ...(count !== undefined ? { count } : {}),
      ...(until !== undefined ? { until } : {}),
      wkst,
    },
  };
}

/** Canonical text for a rule; `parseRule(formatRule(r))` gives back an equal rule. */
export function formatRule(rule: Rule): string {
  const out = [`FREQ=${rule.freq}`];
  if (rule.interval > 1) out.push(`INTERVAL=${rule.interval}`);
  if (rule.byDay.length > 0) {
    out.push(
      `BYDAY=${rule.byDay.map((b) => `${b.nth ?? ''}${DAY_CODES[b.day - 1] ?? ''}`).join(',')}`,
    );
  }
  if (rule.byMonthDay.length > 0) out.push(`BYMONTHDAY=${rule.byMonthDay.join(',')}`);
  if (rule.byMonth.length > 0) out.push(`BYMONTH=${rule.byMonth.join(',')}`);
  if (rule.wkst !== 1) out.push(`WKST=${DAY_CODES[rule.wkst - 1] ?? ''}`);
  if (rule.count !== undefined) out.push(`COUNT=${rule.count}`);
  if (rule.until !== undefined) {
    const compact = rule.until.replace(/-/g, '').replace(':', '');
    out.push(`UNTIL=${compact.length > 8 ? `${compact}00` : compact}`);
  }
  return out.join(';');
}
