import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { documentRoom, boardRoom } from '@nexora/shared';
import { createApiHarness, type ApiHarness } from './helpers/app.js';

let h: ApiHarness;
beforeAll(async () => {
  h = await createApiHarness();
});
afterAll(async () => {
  await h?.close();
});

async function authorize(room: string, cookie?: string) {
  return h.request(`/orgs/${h.orgSlug}/liveblocks-auth`, {
    method: 'POST',
    ...(cookie ? { cookie } : {}),
    body: JSON.stringify({ room }),
  });
}

describe('Liveblocks room authorization', () => {
  it('requires a signed-in organization member', async () => {
    const room = documentRoom(h.organizationId, '01900000-0000-7000-8000-000000000000');
    expect((await authorize(room)).status).toBe(401);
    expect((await authorize(room, h.outsider.cookie)).status).toBe(404);
  });

  it('rejects another tenant and malformed room names before issuing a token', async () => {
    const foreign = documentRoom(
      '01900000-0000-7000-8000-000000000000',
      '01900000-0000-7000-8000-000000000001',
    );
    expect((await authorize(foreign, h.users.member.cookie)).status).toBe(404);
    expect((await authorize('org:*:doc:*', h.users.member.cookie)).status).toBe(404);
  });

  it('requires the document or project to exist in the organization', async () => {
    const absent = '01900000-0000-7000-8000-000000000000';
    expect(
      (await authorize(documentRoom(h.organizationId, absent), h.users.member.cookie)).status,
    ).toBe(404);
    expect(
      (await authorize(boardRoom(h.organizationId, absent), h.users.member.cookie)).status,
    ).toBe(404);
  });
});
