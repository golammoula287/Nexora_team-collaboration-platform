import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // PGlite boots a WASM Postgres per suite; give it room.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
  },
});
