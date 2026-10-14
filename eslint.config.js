// Flat config. The layering rules enforce D-004 (core <- data <- features <- ui <- app).
// They are themselves tested in tests/lint-layers.test.ts — keep both in sync.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const DAS = 'dangerouslySetInnerHTML';
// Only src/core/time may import the date library, so it can be swapped (D-006).
const TEMPORAL = 'temporal-polyfill';

const noInnerHtml = {
  selector: `JSXAttribute[name.name='${DAS}']`,
  message: `${DAS} is forbidden (D-010).`,
};
// Records are never removed directly; deleting writes a tombstone (D-008). Only these files may
// call a Dexie delete, and only to purge expired tombstones or prune old snapshots.
const noHardDelete = {
  selector: 'CallExpression[callee.property.name=/^(delete|bulkDelete|clear)$/]',
  message: 'Hard deletes are only allowed in src/data/purge.ts and src/data/snapshots.ts (D-008).',
};
const noRawDate = [
  {
    selector: "NewExpression[callee.name='Date']",
    message: 'Use core/time instead of new Date() (D-005).',
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: 'Use core/time instead of Date.now() (D-005).',
  },
];

/** Forbid importing the given layers (and packages) from files inside src/<name>. */
const layer = (name, forbiddenLayers, forbiddenPackages = [], ignores = []) => ({
  files: [`src/${name}/**/*.{ts,tsx}`],
  ignores,
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          // Packages, including their sub-paths (e.g. "react-dom/client").
          ...forbiddenPackages.map((p) => ({
            group: [p, `${p}/**`],
            message: `src/${name} must not import "${p}" (D-004, D-006).`,
          })),
          ...forbiddenLayers.map((l) => ({
            group: [`@/${l}`, `@/${l}/**`, `**/${l}`, `**/${l}/**`],
            message: `src/${name} must not import from the "${l}" layer (D-004).`,
          })),
        ],
      },
    ],
  },
});

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'playwright-report', 'test-results', 'tools'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  // Global source rules.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/core/time/**'],
    rules: { 'no-restricted-syntax': ['error', noInnerHtml, ...noRawDate] },
  },
  {
    files: ['src/core/time/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', noInnerHtml] },
  },
  {
    files: ['src/data/**/*.{ts,tsx}'],
    ignores: ['src/data/purge.ts', 'src/data/snapshots.ts'],
    rules: { 'no-restricted-syntax': ['error', noInnerHtml, ...noRawDate, noHardDelete] },
  },
  // Layering. Direction: core <- data <- features <- ui <- app.
  layer(
    'core',
    ['data', 'features', 'ui', 'app', 'lib'],
    ['react', 'react-dom', 'dexie', TEMPORAL],
    ['src/core/time/**'],
  ),
  layer('core/time', ['data', 'features', 'ui', 'app', 'lib'], ['react', 'react-dom', 'dexie']),
  layer('data', ['features', 'ui', 'app', 'lib'], ['react', 'react-dom', TEMPORAL]),
  layer('features', ['ui', 'app'], ['dexie', TEMPORAL]),
  layer('ui', ['data', 'app'], ['dexie', TEMPORAL]),
  layer('lib', ['data', 'features', 'ui', 'app'], [TEMPORAL]),
  layer('app', [], [TEMPORAL]),
);
