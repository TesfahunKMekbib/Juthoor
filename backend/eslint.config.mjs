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
  // Must stay AFTER the ADR-0010 block above (a later no-restricted-imports entry replaces an earlier one).
  {
    // Service boundaries (arch-microservices plan T2, ADR-0013): apps/activity-service and
    // apps/verification-service must not import each other. Services share code only through libs/.
    // These blocks also repeat the ADR-0010 dev pattern, because a later no-restricted-imports entry
    // replaces the earlier one for the same files.
    files: ['apps/activity-service/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/dev/**', '**/dev'], message: 'src/dev is development-only (ADR-0010).' },
            { group: ['**/verification-service/**'], message: 'activity-service must not import verification-service (ADR-0013).' },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/verification-service/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/dev/**', '**/dev'], message: 'src/dev is development-only (ADR-0010).' },
            { group: ['**/activity-service/**'], message: 'verification-service must not import activity-service (ADR-0013).' },
          ],
        },
      ],
    },
  },
  {
    // TEMPORARY allow-list (remove in T4b): the existing verification -> activity coupling that T4 replaces
    // with the SubjectSource/PhotoSource ports and contracts. Do not add entries; T4b deletes this block.
    files: [
      'apps/verification-service/src/verification/agent-input.ts',
      'apps/verification-service/src/verification/verification.module.ts',
      'apps/verification-service/src/verification/verification.service.ts',
      'apps/verification-service/src/verification/verification.service.spec.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/dev/**', '**/dev'], message: 'src/dev is development-only (ADR-0010).' }] },
      ],
    },
  },
);
