// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    rules: {
      // Customize rules as needed
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-require-imports': 'off', // Allow require() for dynamic imports
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': 'off', // Allow console.log for bot logging
    },
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '*.js', // Ignore all JS files (test scripts, config files)
      'jest.config.js',
      'eslint.config.js',
      'test-*.js',
      'debug-*.js',
      'check-*.js',
      'fix-*.js',
      'setup-*.js',
    ],
  }
);
