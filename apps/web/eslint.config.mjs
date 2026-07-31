import root from '../../eslint.config.mjs';

export default [
  ...root,
  {
    files: ['**/*.tsx'],
    rules: {
      // Server Components legitimately return promises from the default export.
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },
];
