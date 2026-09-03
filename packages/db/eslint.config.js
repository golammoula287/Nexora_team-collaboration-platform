import config from '@nexora/config/eslint/node';

export default [
  ...config,
  {
    /**
     * The `no process.env` rule exists to force API code through
     * `apps/api/src/env.ts`. These two files are command-line entry points in a
     * different package - they cannot import the API's env module without the
     * db package depending on the app that depends on it.
     *
     * Narrow by design: only these two files, and only this rule.
     */
    files: ['drizzle.config.ts', 'src/seed.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
];
