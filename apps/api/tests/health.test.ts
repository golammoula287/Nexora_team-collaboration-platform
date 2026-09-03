import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';

describe('GET /health', () => {
  it('answers without authentication', async () => {
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
