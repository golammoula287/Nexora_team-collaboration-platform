import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiHarness, type ApiHarness } from './helpers/app.js';

let h: ApiHarness;
let documentId = '';

beforeAll(async () => {
  h = await createApiHarness();
});
afterAll(async () => {
  await h?.close();
});

describe('documents', () => {
  it('creates, saves and reads editor content with a version', async () => {
    const created = await h.request(`/orgs/${h.orgSlug}/documents`, {
      method: 'POST',
      cookie: h.users.member.cookie,
      body: JSON.stringify({ title: 'Team notes' }),
    });
    expect(created.status).toBe(201);
    documentId = ((await created.json()) as { id: string }).id;

    const saved = await h.request(`/orgs/${h.orgSlug}/documents/${documentId}`, {
      method: 'PATCH',
      cookie: h.users.member.cookie,
      body: JSON.stringify({
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
        },
        contentText: 'Hello',
      }),
    });
    expect(saved.status).toBe(200);
    const read = await h.request(`/orgs/${h.orgSlug}/documents/${documentId}`, {
      cookie: h.users.guest.cookie,
    });
    expect(read.status).toBe(200);
    expect(
      ((await read.json()) as { document: { contentText: string } }).document.contentText,
    ).toBe('Hello');
  });

  it('does not expose a document to a caller outside the organization', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/documents/${documentId}`, {
      cookie: h.outsider.cookie,
    });
    expect(response.status).toBe(404);
  });

  it('rejects a parent document that does not exist in the organization', async () => {
    const response = await h.request(`/orgs/${h.orgSlug}/documents`, {
      method: 'POST',
      cookie: h.users.member.cookie,
      body: JSON.stringify({
        title: 'Child',
        parentDocumentId: '01900000-0000-7000-8000-000000000000',
      }),
    });
    expect(response.status).toBe(404);
  });

  it('rejects a cycle in the document tree', async () => {
    const childResponse = await h.request(`/orgs/${h.orgSlug}/documents`, {
      method: 'POST',
      cookie: h.users.member.cookie,
      body: JSON.stringify({ title: 'Child', parentDocumentId: documentId }),
    });
    expect(childResponse.status).toBe(201);
    const childId = ((await childResponse.json()) as { id: string }).id;
    const response = await h.request(`/orgs/${h.orgSlug}/documents/${documentId}`, {
      method: 'PATCH',
      cookie: h.users.member.cookie,
      body: JSON.stringify({ parentDocumentId: childId }),
    });
    expect(response.status).toBe(400);
  });

  it('favorites documents per user and reorders siblings', async () => {
    const favorite = await h.request(`/orgs/${h.orgSlug}/documents/${documentId}/favorite`, {
      method: 'PUT',
      cookie: h.users.member.cookie,
      body: JSON.stringify({ favorite: true }),
    });
    expect(favorite.status).toBe(200);
    const memberList = await h.request(`/orgs/${h.orgSlug}/documents`, {
      cookie: h.users.member.cookie,
    });
    const guestList = await h.request(`/orgs/${h.orgSlug}/documents`, {
      cookie: h.users.guest.cookie,
    });
    const findFavorite = async (response: Response) =>
      (
        (await response.json()) as { documents: { id: string; favorite: boolean }[] }
      ).documents.find((row) => row.id === documentId)?.favorite;
    expect(await findFavorite(memberList)).toBe(true);
    expect(await findFavorite(guestList)).toBe(false);

    const another = await h.request(`/orgs/${h.orgSlug}/documents`, {
      method: 'POST',
      cookie: h.users.member.cookie,
      body: JSON.stringify({ title: 'Another' }),
    });
    const anotherId = ((await another.json()) as { id: string }).id;
    const moved = await h.request(`/orgs/${h.orgSlug}/documents/${anotherId}/move`, {
      method: 'POST',
      cookie: h.users.member.cookie,
      body: JSON.stringify({ parentDocumentId: null, afterDocumentId: documentId }),
    });
    expect(moved.status).toBe(200);
  });

  it('creates from a preset and saves a custom template', async () => {
    const preset = await h.request(`/orgs/${h.orgSlug}/documents/from-template`, {
      method: 'POST',
      cookie: h.users.member.cookie,
      body: JSON.stringify({ preset: 'meeting-notes' }),
    });
    expect(preset.status).toBe(201);
    const body = (await preset.json()) as { document: { id: string; contentText: string } };
    expect(body.document.contentText).toContain('Agenda');
    const saved = await h.request(`/orgs/${h.orgSlug}/document-templates`, {
      method: 'POST',
      cookie: h.users.member.cookie,
      body: JSON.stringify({ documentId: body.document.id, name: 'My notes' }),
    });
    expect(saved.status).toBe(201);
    const templateId = ((await saved.json()) as { id: string }).id;
    const applied = await h.request(`/orgs/${h.orgSlug}/documents/from-template`, {
      method: 'POST',
      cookie: h.users.member.cookie,
      body: JSON.stringify({ templateId }),
    });
    expect(applied.status).toBe(201);
  });

  it('sets a wiki home only for a document in the same space', async () => {
    const space = await h.request(`/orgs/${h.orgSlug}/spaces`, {
      method: 'POST',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ name: 'Knowledge', slug: 'knowledge' }),
    });
    const spaceId = ((await space.json()) as { id: string }).id;
    const created = await h.request(`/orgs/${h.orgSlug}/documents`, {
      method: 'POST',
      cookie: h.users.member.cookie,
      body: JSON.stringify({ title: 'Wiki', spaceId }),
    });
    const wikiId = ((await created.json()) as { id: string }).id;
    const set = await h.request(`/orgs/${h.orgSlug}/spaces/${spaceId}/wiki-home`, {
      method: 'PUT',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ documentId: wikiId }),
    });
    expect(set.status).toBe(200);
    const rejected = await h.request(`/orgs/${h.orgSlug}/spaces/${spaceId}/wiki-home`, {
      method: 'PUT',
      cookie: h.users.owner.cookie,
      body: JSON.stringify({ documentId }),
    });
    expect(rejected.status).toBe(400);
  });

  it('adds a selection comment and resolves it', async () => {
    const created = await h.request(`/orgs/${h.orgSlug}/documents/${documentId}/annotations`, {
      method: 'POST',
      cookie: h.users.member.cookie,
      body: JSON.stringify({
        bodyText: 'Clarify this',
        selectionFrom: 1,
        selectionTo: 6,
        selectionQuote: 'Hello',
        suggestion: 'Welcome',
      }),
    });
    expect(created.status).toBe(201);
    const annotationId = ((await created.json()) as { id: string }).id;
    const resolved = await h.request(
      `/orgs/${h.orgSlug}/documents/${documentId}/annotations/${annotationId}`,
      {
        method: 'PATCH',
        cookie: h.users.member.cookie,
        body: JSON.stringify({ resolved: true }),
      },
    );
    expect(resolved.status).toBe(200);
    const list = await h.request(`/orgs/${h.orgSlug}/documents/${documentId}/annotations`, {
      cookie: h.users.guest.cookie,
    });
    expect(list.status).toBe(200);
    const annotations = ((await list.json()) as { annotations: { resolvedAt: string | null }[] })
      .annotations;
    expect(annotations[0]?.resolvedAt).not.toBeNull();
  });
});
