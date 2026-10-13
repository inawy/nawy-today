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
