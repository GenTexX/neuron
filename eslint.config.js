import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './apps/web/svelte.config.js';

/**
 * Grenzregel aus §3.1: packages/engine und packages/games sind DOM-frei,
 * zeitfrei und zustandsfrei. Kein window/document/performance/Date/Math.random.
 */
const domFreeGlobals = ['window', 'document', 'performance', 'Date', 'navigator', 'localStorage'];

export default ts.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.svelte-kit/**',
      '**/target/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'pnpm-lock.yaml',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  {
    files: ['packages/engine/src/**/*.ts', 'packages/games/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...domFreeGlobals.map((name) => ({
          name,
          message: `"${name}" ist in packages/* verboten (§3.1: DOM-frei, zeitfrei, zustandsfrei).`,
        })),
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Math.random ist verboten – nur der deterministische Rng aus @neuron/engine (§3.1).',
        },
        { object: 'Date', property: 'now', message: 'Date.now ist in packages/* verboten (§3.1).' },
        {
          object: 'performance',
          property: 'now',
          message: 'performance.now ist in packages/* verboten (§3.1).',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['$lib/*', '$app/*', '@neuron/web', '@neuron/web/*', '**/apps/web/**'],
              message: 'packages/* darf nichts aus apps/web importieren (§3.1).',
            },
            {
              group: ['svelte', 'svelte/*'],
              message: 'packages/* ist DOM-/Framework-frei (§3.1).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
        svelteConfig,
      },
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts', '**/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
