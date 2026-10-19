import { parseEnvelope } from '@/core/model';
import type { Envelope, EnvelopeError } from '@/core/model';
import { datePart, nowLocal } from '@/core/time';
import type { TimeZoneId } from '@/core/time';
import type { MessageKey } from '@/features/i18n';

/** `nawy-today-2026-10-19.json`, with the date as the person's own calendar sees it. */
export function backupFileName(epochMs: number, timeZone: TimeZoneId): string {
  return `nawy-today-${datePart(nowLocal(timeZone, epochMs))}.json`;
}

/** A backup bigger than this is not ours (the data is text; thousands of events are KBs). */
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

export type ReadFailure = 'too-big' | EnvelopeError['code'];

export type ReadOutcome =
  | { readonly ok: true; readonly envelope: Envelope }
  | { readonly ok: false; readonly failure: ReadFailure };

/** Parses the text of a chosen file. Never throws: every failure is a named reason. */
export function readBackupText(text: string, byteLength: number = text.length): ReadOutcome {
  if (byteLength > MAX_BACKUP_BYTES) return { ok: false, failure: 'too-big' };
  const parsed = parseEnvelope(text);
  return parsed.ok
    ? { ok: true, envelope: parsed.value }
    : { ok: false, failure: parsed.error.code };
}

/** The message shown for each way a file can be refused. */
export function failureMessageKey(failure: ReadFailure): MessageKey {
  switch (failure) {
    case 'too-big':
      return 'importTooBig';
    case 'not-json':
    case 'not-an-envelope':
      return 'importNotBackup';
    case 'wrong-app':
      return 'importWrongApp';
    case 'newer-version':
      return 'importNewer';
    default:
      return 'importInvalid';
  }
}
