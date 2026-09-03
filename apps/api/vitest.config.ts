import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // The funnel tests boot PGlite and run real migrations.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    pool: 'forks',
  },
});
