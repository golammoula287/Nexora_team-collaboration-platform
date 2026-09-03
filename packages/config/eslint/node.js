import globals from 'globals';
import base from './base.js';

/** Backend packages and apps/api. */
export default [
  ...base,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Secrets are read only through src/env.ts, never process.env inline.
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read configuration through src/env.ts, never process.env directly.',
        },
      ],
    },
  },
  {
    // env.ts is the one place allowed to touch process.env.
    files: ['**/env.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
];
