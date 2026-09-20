import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import {
  createDocumentAnnotationSchema,
  createDocumentFromTemplateSchema,
  createDocumentSchema,
  createDocumentTemplateSchema,
  moveDocumentSchema,
  resolveDocumentAnnotationSchema,
  setDocumentFavoriteSchema,
  setWikiHomeSchema,
  updateDocumentSchema,
} from '@nexora/shared';
import { actorFrom } from '../lib/actor.js';
import { authorize } from '../middleware/authorize.js';
import { requireOrg } from '../middleware/org.js';
import { requireSession } from '../middleware/session.js';
import {
  createDocument,
  createDocumentAnnotation,
  createDocumentFromTemplate,
  deleteDocument,
  getDocument,
  listDocumentAnnotations,
  listDocumentTemplates,
  listDocumentVersions,
  listDocuments,
  moveDocument,
  resolveDocumentAnnotation,
  restoreDocumentVersion,
  saveDocumentTemplate,
  setDocumentFavorite,
  setSpaceWikiHome,
  updateDocument,
} from '../services/documents.js';
import type { Services } from '../services.js';
import type { AppBindings } from '../types/context.js';

export function documentRoute(services: Services) {
  const session = requireSession(services);
  const org = requireOrg(services);
  return new Hono<AppBindings>()
    .get('/orgs/:orgSlug/documents', session, org, authorize('read', 'document'), async (c) =>
      c.json({
        documents: await listDocuments(services.db, c.get('organization').id, c.get('user').id),
      }),
    )
    .get(
      '/orgs/:orgSlug/document-templates',
      session,
      org,
      authorize('read', 'document'),
      async (c) => c.json(await listDocumentTemplates(services.db, c.get('organization').id)),
    )
    .post(
      '/orgs/:orgSlug/document-templates',
      session,
      org,
      authorize('create', 'document'),
      zValidator('json', createDocumentTemplateSchema),
      async (c) =>
        c.json(
          { id: await saveDocumentTemplate(services.db, actorFrom(c), c.req.valid('json')) },
          201,
        ),
    )
    .post(
      '/orgs/:orgSlug/documents/from-template',
      session,
      org,
      authorize('create', 'document'),
      zValidator('json', createDocumentFromTemplateSchema),
      async (c) =>
        c.json(
          {
            document: await createDocumentFromTemplate(
              services.db,
              actorFrom(c),
              c.req.valid('json'),
            ),
          },
          201,
        ),
    )
    .put(
      '/orgs/:orgSlug/spaces/:spaceId/wiki-home',
      session,
      org,
      authorize('update', 'space'),
      zValidator('json', setWikiHomeSchema),
      async (c) =>
        c.json(
          await setSpaceWikiHome(
            services.db,
            actorFrom(c),
            c.req.param('spaceId'),
            c.req.valid('json').documentId,
          ),
        ),
    )
    .get(
      '/orgs/:orgSlug/documents/:documentId/versions',
      session,
      org,
      authorize('read', 'document'),
      async (c) =>
        c.json({
          versions: await listDocumentVersions(
            services.db,
            c.get('organization').id,
            c.req.param('documentId'),
          ),
        }),
    )
    .post(
      '/orgs/:orgSlug/documents/:documentId/versions/:versionId/restore',
      session,
      org,
      authorize('update', 'document'),
      async (c) =>
        c.json({
          document: await restoreDocumentVersion(
            services.db,
            actorFrom(c),
            c.req.param('documentId'),
            c.req.param('versionId'),
          ),
        }),
    )
    .get(
      '/orgs/:orgSlug/documents/:documentId/annotations',
      session,
      org,
      authorize('read', 'document'),
      async (c) =>
        c.json({
          annotations: await listDocumentAnnotations(
            services.db,
            c.get('organization').id,
            c.req.param('documentId'),
          ),
        }),
    )
    .post(
      '/orgs/:orgSlug/documents/:documentId/annotations',
      session,
      org,
      authorize('update', 'document'),
      zValidator('json', createDocumentAnnotationSchema),
      async (c) =>
        c.json(
          {
            id: await createDocumentAnnotation(
              services.db,
              actorFrom(c),
              c.req.param('documentId'),
              c.req.valid('json'),
            ),
          },
          201,
        ),
    )
    .patch(
      '/orgs/:orgSlug/documents/:documentId/annotations/:annotationId',
      session,
      org,
      authorize('update', 'document'),
      zValidator('json', resolveDocumentAnnotationSchema),
      async (c) =>
        c.json(
          await resolveDocumentAnnotation(
            services.db,
            actorFrom(c),
            c.req.param('documentId'),
            c.req.param('annotationId'),
            c.req.valid('json').resolved,
          ),
        ),
    )
    .put(
      '/orgs/:orgSlug/documents/:documentId/favorite',
      session,
      org,
      authorize('read', 'document'),
      zValidator('json', setDocumentFavoriteSchema),
      async (c) =>
        c.json(
          await setDocumentFavorite(
            services.db,
            actorFrom(c),
            c.req.param('documentId'),
            c.req.valid('json').favorite,
          ),
        ),
    )
    .post(
      '/orgs/:orgSlug/documents/:documentId/move',
      session,
      org,
      authorize('update', 'document'),
      zValidator('json', moveDocumentSchema),
      async (c) =>
        c.json({
          document: await moveDocument(
            services.db,
            actorFrom(c),
            c.req.param('documentId'),
            c.req.valid('json'),
          ),
        }),
    )
    .get(
      '/orgs/:orgSlug/documents/:documentId',
      session,
      org,
      authorize('read', 'document'),
      async (c) =>
        c.json({
          document: await getDocument(
            services.db,
            c.get('organization').id,
            c.req.param('documentId'),
          ),
        }),
    )
    .post(
      '/orgs/:orgSlug/documents',
      session,
      org,
      authorize('create', 'document'),
      zValidator('json', createDocumentSchema),
      async (c) =>
        c.json({ id: await createDocument(services.db, actorFrom(c), c.req.valid('json')) }, 201),
    )
    .patch(
      '/orgs/:orgSlug/documents/:documentId',
      session,
      org,
      authorize('update', 'document'),
      zValidator('json', updateDocumentSchema),
      async (c) =>
        c.json({
          document: await updateDocument(
            services.db,
            actorFrom(c),
            c.req.param('documentId'),
            c.req.valid('json'),
          ),
        }),
    )
    .delete(
      '/orgs/:orgSlug/documents/:documentId',
      session,
      org,
      authorize('delete', 'document'),
      async (c) =>
        c.json(await deleteDocument(services.db, actorFrom(c), c.req.param('documentId'))),
    );
}
