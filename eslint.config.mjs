// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Root flat ESLint config shared by every workspace package.
 * App-specific configs extend this and add framework rules.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/build/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.generated.ts',
      'prisma/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-restricted-syntax': [
        'error',
        {
          // Guardrail: the OpenAI standard key must never be reachable from a client bundle.
          selector:
            "MemberExpression[object.type='MemberExpression'][object.property.name='env'] > Identifier[name=/^(EXPO_PUBLIC_OPENAI|NEXT_PUBLIC_OPENAI)/]",
          message:
            'The OpenAI API key must never be exposed through a public (client-visible) environment variable.',
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/tests/**/*.ts', '**/e2e/**/*.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.mjs', '**/*.config.ts', '**/*.config.mjs', 'infra/scripts/**/*.mjs'],
    rules: {
      'no-console': 'off',
    },
  },
);
