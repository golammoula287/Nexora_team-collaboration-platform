import { describe, expect, it } from 'vitest';

/**
 * Guards the rule that keeps the split safe: nothing secret may be exposed to
 * the browser. This reads the committed template, so adding a secret-looking
 * NEXT_PUBLIC_* variable fails CI.
 */
describe('apps/web env template', () => {
  it('exposes no secret-looking public variables', async () => {
    const { readFile } = await import('node:fs/promises');
    const template = await readFile(new URL('../../.env.example', import.meta.url), 'utf8');

    const offenders = template
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('NEXT_PUBLIC_'))
      .filter((line) => /SECRET|PRIVATE|_SECRET_KEY|PASSWORD|_TOKEN/i.test(line));

    expect(offenders).toEqual([]);
  });
});
