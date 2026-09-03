import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Services } from '../src/services.js';

/**
 * Health is dependency-free by design - it must answer even when the database
 * is unreachable, since a health check that fails when Postgres fails cannot
 * tell you that Postgres failed. So it is tested with no real services at all.
 */
const app = createApp({} as Services);

describe('GET /health', () => {
  it('answers without authentication or a database', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toMatchObject({ ok: true, service: 'nexora-api' });
  });

  it('returns a request id header', async () => {
    const res = await app.request('/health');
    expect(res.headers.get('X-Request-Id')).toBeTruthy();
  });
});

describe('unknown routes', () => {
  it('returns the standard error shape', async () => {
    const res = await app.request('/does-not-exist');
    expect(res.status).toBe(404);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });
});
