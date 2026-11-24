// ESLint flat config for the Juthoor backend (NestJS + TypeScript).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
    rules: {
      // Juthoor rule: never silence the compiler (see .claude/rules/backend.md).
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': true, 'ts-nocheck': true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // CommonJS config files (ADR-0003: `.cjs` must stay CommonJS) may use require().
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // ADR-0010: nothing outside src/dev may import the development participant.
    files: ['**/*.ts'],
    ignores: ['src/dev/**', 'src/app.module.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/dev/**', '**/dev'],
              message: 'src/dev is development-only; only app.module.ts may load it (ADR-0010).',
            },
          ],
        },
      ],
    },
  },
);
