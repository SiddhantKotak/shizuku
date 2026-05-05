// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Flat-config ESLint for the Shizuku monorepo.
 *
 * Layers (later configs override earlier):
 *   1. Ignored paths
 *   2. Base recommended (JS + TS)
 *   3. Type-aware TS rules (project-wide)
 *   4. Workspace-specific overrides:
 *      - apps/web/**   React 18 + JSX runtime
 *      - apps/api/**   Node service (no DOM globals, no React)
 *      - packages/**   Shared TS libs
 *      - tests/**      relaxed rules
 *   5. Prettier compatibility (turn off all stylistic rules)
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
      'pnpm-lock.yaml',
      '**/routeTree.gen.ts',
      'packages/db/migrations/**',
      'infra/**',
      '2007069a-*.pdf',
      'file.txt',
    ],
  },

  // Base recommended (no type info — fast)
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Strict, type-aware rules for our source files only
  {
    files: ['apps/**/src/**/*.{ts,tsx}', 'packages/**/src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Strictness above defaults
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false, arguments: false } },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'off', // Fastify handlers are conventionally async
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true, allowNullish: true },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  // apps/web — React + browser globals
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2022 },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // apps/api — Node globals, no DOM
  {
    files: ['apps/api/src/**/*.{ts,tsx}', 'packages/**/src/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2022 },
    },
  },

  // Tests + scripts — relaxed
  {
    files: [
      '**/tests/**/*.{ts,tsx}',
      '**/*.test.{ts,tsx}',
      '**/scripts/**/*.ts',
      '**/vitest.config.ts',
      '**/vite.config.ts',
      '**/drizzle.config.ts',
      '**/eslint.config.js',
      '**/postcss.config.cjs',
      '**/tailwind.config.ts',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      'no-console': 'off',
    },
  },

  // Disable all stylistic rules — Prettier owns formatting
  prettier,
);
