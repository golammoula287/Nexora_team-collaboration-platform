import { z } from 'zod';

export const documentContentSchema = z.object({
  type: z.literal('doc'),
  content: z.array(z.unknown()).optional(),
});

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200).default('Untitled'),
  spaceId: z.uuid().optional(),
  projectId: z.uuid().optional(),
  parentDocumentId: z.uuid().optional(),
  content: documentContentSchema.optional(),
  contentText: z.string().max(1_000_000).optional(),
});

export const updateDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: documentContentSchema.optional(),
  contentText: z.string().max(1_000_000).optional(),
  parentDocumentId: z.uuid().nullable().optional(),
});

export const moveDocumentSchema = z.object({
  parentDocumentId: z.uuid().nullable(),
  afterDocumentId: z.uuid().nullable(),
});

export const setDocumentFavoriteSchema = z.object({ favorite: z.boolean() });

export const setWikiHomeSchema = z.object({ documentId: z.uuid() });

export const createDocumentTemplateSchema = z.object({
  documentId: z.uuid(),
  name: z.string().trim().min(1).max(100),
});

export const createDocumentFromTemplateSchema = z
  .object({
    templateId: z.uuid().optional(),
    preset: z.enum(['meeting-notes', 'prd', 'retro', 'sop', 'onboarding']).optional(),
    spaceId: z.uuid().optional(),
    projectId: z.uuid().optional(),
  })
  .refine((value) => Boolean(value.templateId) !== Boolean(value.preset), 'Choose one template');

export const documentTemplatePayloadSchema = z.object({
  title: z.string().min(1).max(200),
  content: documentContentSchema,
  contentText: z.string().max(1_000_000),
});

export const createDocumentAnnotationSchema = z.object({
  bodyText: z.string().trim().min(1).max(10000),
  selectionFrom: z.number().int().min(0),
  selectionTo: z.number().int().min(0),
  selectionQuote: z.string().max(1000),
  suggestion: z.string().max(10000).optional(),
});

export const resolveDocumentAnnotationSchema = z.object({ resolved: z.boolean() });

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
export type MoveDocumentInput = z.infer<typeof moveDocumentSchema>;
export type CreateDocumentTemplateInput = z.infer<typeof createDocumentTemplateSchema>;
export type CreateDocumentFromTemplateInput = z.infer<typeof createDocumentFromTemplateSchema>;
export type CreateDocumentAnnotationInput = z.infer<typeof createDocumentAnnotationSchema>;
