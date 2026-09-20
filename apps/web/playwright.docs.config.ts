import { defineConfig } from '@playwright/test';

/** Isolated Docs gate when port 3000 is occupied by another local project. */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'docs.spec.ts',
  workers: 1,
  use: { baseURL: 'http://localhost:3001' },
  webServer: [
    {
      command: 'pnpm --filter @nexora/api dev',
      url: 'http://localhost:4000/health',
      env: { CORS_ORIGIN: 'http://localhost:3001', WEB_URL: 'http://localhost:3001' },
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: 'pnpm --filter @nexora/web exec next dev --turbopack --port 3001',
      port: 3001,
      env: { NEXT_PUBLIC_APP_URL: 'http://localhost:3001' },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
    },
  ],
});
