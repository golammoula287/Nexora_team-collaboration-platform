import globals from 'globals';
import base from './base.js';

/**
 * apps/web. The important rule here is the import boundary: the browser bundle
 * must never contain backend runtime code. See docs/ARCHITECTURE.md.
 */
export default [
  ...base,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@nexora/api',
              message:
                'Type-only import: use `import type { AppType } from "@nexora/api"`. ' +
                'Backend runtime code must never reach the browser bundle.',
              allowTypeImports: true,
            },
            ...['@nexora/db', '@nexora/auth', '@nexora/ai', '@nexora/jobs', '@nexora/email'].map(
              (name) => ({
                name,
                message:
                  'Backend-only package. The frontend talks to the API over HTTP - see apps/web/lib/api.ts.',
              }),
            ),
          ],
          patterns: [
            {
              group: ['@nexora/db/*', '@nexora/auth/*', '@nexora/ai/*', '@nexora/jobs/*'],
              message: 'Backend-only package. The frontend talks to the API over HTTP.',
            },
          ],
        },
      ],
      // A full page reload is never the way to refresh data (CLAUDE.md).
      'no-restricted-globals': [
        'error',
        { name: 'location', message: 'Never window.location.reload() - invalidate the query cache.' },
      ],
    },
  },
];
