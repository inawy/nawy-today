// @vitest-environment node
// Negative tests: the architecture rules (D-004, D-005, D-010) must actually FAIL on violations.
// A lint rule that never fires is worse than no rule.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'parse-error');
}

const IMPORT = 'no-restricted-imports';
const SYNTAX = 'no-restricted-syntax';

describe('layer rules', () => {
  it.each([
    ['src/core/x.ts', "import { db } from '@/data/db';"],
    ['src/core/x.ts', "import { useX } from '@/features/x';"],
    ['src/core/x.ts', "import { createRoot } from 'react-dom/client';"],
    ['src/core/x.ts', "import Dexie from 'dexie';"],
    ['src/data/x.ts', "import { View } from '@/ui/View';"],
    ['src/data/x.ts', "import { useState } from 'react';"],
    ['src/features/x.ts', "import { View } from '../ui/View';"],
    ['src/features/x.ts', "import Dexie from 'dexie';"],
    ['src/ui/x.tsx', "import { db } from '@/data/db';"],
    ['src/ui/x.tsx', "import Dexie from 'dexie';"],
    ['src/ui/x.tsx', "import { App } from '@/app/App';"],
    ['src/lib/x.ts', "import { db } from '@/data/db';"],
    // temporal-polyfill is private to core/time (D-006)
    ['src/ui/x.tsx', "import { Temporal } from 'temporal-polyfill';"],
    ['src/app/x.tsx', "import { Temporal } from 'temporal-polyfill';"],
    ['src/data/x.ts', "import { Temporal } from 'temporal-polyfill';"],
    ['src/core/recurrence/x.ts', "import { Temporal } from 'temporal-polyfill';"],
    // core/time keeps the same layer restrictions as the rest of core
    ['src/core/time/x.ts', "import { db } from '@/data/db';"],
    ['src/core/time/x.ts', "import { useState } from 'react';"],
    // core/model is pure: no data layer, UI, database or date library of its own
    ['src/core/model/x.ts', "import { db } from '@/data/db';"],
    ['src/core/model/x.ts', "import Dexie from 'dexie';"],
    ['src/core/model/x.ts', "import { Temporal } from 'temporal-polyfill';"],
    ['src/data/x.ts', "import { View } from '@/app/App';"],
  ])('rejects: %s  %s', async (file, code) => {
    expect(await ruleIds(code, file)).toContain(IMPORT);
  });

  it.each([
    ['src/data/x.ts', "import { clamp } from '@/core/math';\nexport const v = clamp;"],
    ['src/features/x.ts', "import { db } from '@/data/db';\nexport const v = db;"],
    ['src/ui/x.tsx', "import { useEvents } from '@/features/events';\nexport const v = useEvents;"],
    ['src/ui/x.tsx', "import { useState } from 'react';\nexport const v = useState;"],
    ['src/app/x.tsx', "import { View } from '@/ui/View';\nexport const v = View;"],
    [
      'src/core/time/x.ts',
      "import { Temporal } from 'temporal-polyfill';\nexport const t = Temporal;",
    ],
    ['src/ui/x.tsx', "import { todayIn } from '@/core/time';\nexport const v = todayIn;"],
    [
      'src/core/model/x.ts',
      "import { isValidDate } from '@/core/time';\nexport const v = isValidDate;",
    ],
    ['src/data/x.ts', "import Dexie from 'dexie';\nexport const v = Dexie;"],
    ['src/data/x.ts', "import { parseEvent } from '@/core/model';\nexport const v = parseEvent;"],
  ])('allows: %s  %s', async (file, code) => {
    expect(await ruleIds(code, file)).not.toContain(IMPORT);
  });
});

describe('syntax rules', () => {
  it('rejects new Date() and Date.now() outside core/time', async () => {
    expect(await ruleIds('export const d = new Date();', 'src/ui/x.ts')).toContain(SYNTAX);
    expect(await ruleIds('export const d = Date.now();', 'src/features/x.ts')).toContain(SYNTAX);
  });

  it('allows new Date() inside core/time', async () => {
    expect(await ruleIds('export const d = new Date();', 'src/core/time/x.ts')).not.toContain(
      SYNTAX,
    );
  });

  it('rejects dangerouslySetInnerHTML everywhere in src', async () => {
    const code = 'export const A = () => <div dangerouslySetInnerHTML={{ __html: "x" }} />;';
    expect(await ruleIds(code, 'src/ui/A.tsx')).toContain(SYNTAX);
    expect(await ruleIds(code, 'src/core/time/A.tsx')).toContain(SYNTAX);
  });
});

describe('hard-delete rule (D-008): records are removed only by purge.ts and snapshots.ts', () => {
  const calls = [
    ['delete', "declare const db: any;\ndb.events.delete('x');"],
    ['bulkDelete', "declare const db: any;\ndb.events.bulkDelete(['x']);"],
    ['clear', 'declare const db: any;\ndb.events.clear();'],
    [
      'a delete reached through a query',
      "declare const db: any;\ndb.events.where('a').equals(1).delete();",
    ],
  ] as const;

  it.each(calls)('rejects %s anywhere else in src/data', async (_label, code) => {
    for (const file of ['src/data/store.ts', 'src/data/backup.ts', 'src/data/new-file.ts']) {
      expect(await ruleIds(code, file)).toContain(SYNTAX);
    }
  });

  it.each(calls)('allows %s in purge.ts and snapshots.ts', async (_label, code) => {
    for (const file of ['src/data/purge.ts', 'src/data/snapshots.ts']) {
      expect(await ruleIds(code, file)).not.toContain(SYNTAX);
    }
  });

  it('does not restrict other layers (e.g. Map.delete in core)', async () => {
    const code = 'export const f = (m: Map<string, number>) => m.delete("x");';
    expect(await ruleIds(code, 'src/core/x.ts')).not.toContain(SYNTAX);
  });

  it('keeps the other syntax rules active in src/data', async () => {
    expect(await ruleIds('export const d = Date.now();', 'src/data/store.ts')).toContain(SYNTAX);
    expect(await ruleIds('export const d = new Date();', 'src/data/store.ts')).toContain(SYNTAX);
    const jsx = 'export const A = () => <div dangerouslySetInnerHTML={{ __html: "x" }} />;';
    expect(await ruleIds(jsx, 'src/data/A.tsx')).toContain(SYNTAX);
  });
});
