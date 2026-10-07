import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.browser },
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'object-shorthand': 'error',
      'prefer-template': 'error',
      'arrow-body-style': ['error', 'as-needed'],
    },
  },
  { files: ['**/theme-init.js'], languageOptions: { sourceType: 'script' } },
];
