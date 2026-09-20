'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '../../../../lib/api';

type DocumentRow = {
  id: string;
  title: string;
  spaceId: string | null;
  projectId: string | null;
  parentDocumentId: string | null;
  position: string;
  favorite: boolean;
  wikiHome: boolean;
};
type Group = { id: string; name: string };
type Template = { id: string; name: string };
type Preset = { key: string; name: string };

export function DocsWorkspace({
  orgSlug,
  initialDocuments,
  spaces,
  projects,
  presets,
  templates,
  canCreate,
  canSetWiki,
}: {
  orgSlug: string;
  initialDocuments: DocumentRow[];
  spaces: Group[];
  projects: (Group & { spaceId: string })[];
  presets: Preset[];
  templates: Template[];
  canCreate: boolean;
  canSetWiki: boolean;
}) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [scope, setScope] = useState('workspace');
  const [template, setTemplate] = useState('blank');
  const [dragged, setDragged] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function reload() {
    const response = await api.orgs[':orgSlug'].documents.$get({ param: { orgSlug } });
    if (!response.ok) throw new Error('Could not reload documents');
    setDocuments((await response.json()).documents);
    router.refresh();
  }

  async function create() {
    setPending(true);
    setError('');
    try {
      const spaceId = scope.startsWith('space:') ? scope.slice(6) : undefined;
      const projectId = scope.startsWith('project:') ? scope.slice(8) : undefined;
      if (template === 'blank') {
        const response = await api.orgs[':orgSlug'].documents.$post({
          param: { orgSlug },
          json: {
            title: 'Untitled',
            ...(spaceId ? { spaceId } : {}),
            ...(projectId ? { projectId } : {}),
          },
        });
        if (!response.ok) throw new Error('Could not create document');
        router.push(`/${orgSlug}/docs/${(await response.json()).id}`);
      } else {
        const json = template.startsWith('preset:')
          ? {
              preset: template.slice(7) as 'meeting-notes' | 'prd' | 'retro' | 'sop' | 'onboarding',
              spaceId,
              projectId,
            }
          : { templateId: template.slice(7), spaceId, projectId };
        const response = await api.orgs[':orgSlug'].documents['from-template'].$post({
          param: { orgSlug },
          json,
        });
        if (!response.ok) throw new Error('Could not create from template');
        router.push(`/${orgSlug}/docs/${(await response.json()).document.id}`);
      }
      router.refresh();
    } catch {
      setError('Could not create document. Try again.');
    } finally {
      setPending(false);
    }
  }

  async function createChild(parent: DocumentRow) {
    const response = await api.orgs[':orgSlug'].documents.$post({
      param: { orgSlug },
      json: { title: 'Untitled', parentDocumentId: parent.id },
    });
    if (!response.ok) {
      setError('Could not create child document.');
      return;
    }
    router.push(`/${orgSlug}/docs/${(await response.json()).id}`);
    router.refresh();
  }

  async function favorite(document: DocumentRow) {
    const response = await api.orgs[':orgSlug'].documents[':documentId'].favorite.$put({
      param: { orgSlug, documentId: document.id },
      json: { favorite: !document.favorite },
    });
    if (!response.ok) {
      setError('Could not update favorite.');
      return;
    }
    await reload();
  }

  async function wikiHome(document: DocumentRow) {
    if (!document.spaceId) return;
    const response = await api.orgs[':orgSlug'].spaces[':spaceId']['wiki-home'].$put({
      param: { orgSlug, spaceId: document.spaceId },
      json: { documentId: document.id },
    });
    if (!response.ok) {
      setError('Could not set wiki home.');
      return;
    }
    await reload();
  }

  async function move(id: string, parentDocumentId: string | null, afterDocumentId: string | null) {
    const response = await api.orgs[':orgSlug'].documents[':documentId'].move.$post({
      param: { orgSlug, documentId: id },
      json: { parentDocumentId, afterDocumentId },
    });
    if (!response.ok) {
      setError('Could not move document. Check that it stays in the same space or project.');
      return;
    }
    await reload();
  }

  function renderTree(
    rows: DocumentRow[],
    parentId: string | null,
    depth: number,
  ): React.ReactNode {
    if (depth > 20) return null;
    const siblings = rows
      .filter((row) => row.parentDocumentId === parentId)
      .sort((a, b) => a.position.localeCompare(b.position));
    return siblings.map((document, index) => (
      <li key={document.id} className="space-y-1">
        <div
          draggable={canCreate}
          onDragStart={() => setDragged(document.id)}
          onDragEnd={() => setDragged(null)}
          onDragOver={(event) => {
            if (dragged && dragged !== document.id) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (dragged && dragged !== document.id) void move(dragged, parentId, document.id);
            setDragged(null);
          }}
          className="hover:bg-surface-2 flex flex-wrap items-center gap-2 rounded-md px-2 py-1"
          style={{ marginLeft: `${depth * 16}px` }}
        >
          <Link
            href={`/${orgSlug}/docs/${document.id}`}
            className="text-fg focus-visible:outline-ring min-w-0 flex-1 truncate text-sm focus-visible:outline-2"
          >
            {document.wikiHome ? '⌂ ' : ''}
            {document.title}
          </Link>
          <button
            type="button"
            aria-label={`${document.favorite ? 'Remove' : 'Add'} ${document.title} ${document.favorite ? 'from' : 'to'} favorites`}
            onClick={() => favorite(document)}
            className="text-fg-muted focus-visible:outline-ring rounded px-1 focus-visible:outline-2"
          >
            {document.favorite ? '★' : '☆'}
          </button>
          {canCreate && (
            <>
              <button
                type="button"
                onClick={() => createChild(document)}
                className="text-fg-muted hover:text-fg focus-visible:outline-ring rounded px-1 text-xs focus-visible:outline-2"
              >
                New child
              </button>
              <select
                aria-label={`Parent of ${document.title}`}
                value={document.parentDocumentId ?? ''}
                onChange={(event) => move(document.id, event.target.value || null, null)}
                className="border-border bg-surface text-fg max-w-28 rounded border px-1 py-1 text-xs"
              >
                <option value="">Root</option>
                {rows
                  .filter((candidate) => candidate.id !== document.id)
                  .map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.title}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                aria-label={`Move ${document.title} up`}
                disabled={index === 0}
                onClick={() =>
                  move(document.id, parentId, index > 1 ? (siblings[index - 2]?.id ?? null) : null)
                }
                className="text-fg-muted focus-visible:outline-ring rounded px-1 text-xs focus-visible:outline-2 disabled:opacity-40"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${document.title} down`}
                disabled={index === siblings.length - 1}
                onClick={() => move(document.id, parentId, siblings[index + 1]?.id ?? null)}
                className="text-fg-muted focus-visible:outline-ring rounded px-1 text-xs focus-visible:outline-2 disabled:opacity-40"
              >
                ↓
              </button>
              {canSetWiki && document.spaceId && !document.wikiHome && (
                <button
                  type="button"
                  onClick={() => wikiHome(document)}
                  className="text-fg-muted hover:text-fg focus-visible:outline-ring rounded px-1 text-xs focus-visible:outline-2"
                >
                  Set wiki home
                </button>
              )}
            </>
          )}
        </div>
        {canCreate && (
          <div
            onDragOver={(event) => {
              if (dragged && dragged !== document.id) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (dragged && dragged !== document.id) void move(dragged, document.id, null);
              setDragged(null);
            }}
            className="text-fg-muted border-border ml-6 h-5 rounded border border-dashed text-xs"
          >
            <span className="sr-only">Drop to nest under {document.title}</span>
          </div>
        )}
        {renderTree(rows, document.id, depth + 1)}
      </li>
    ));
  }

  function section(title: string, rows: DocumentRow[]) {
    if (rows.length === 0) return null;
    return (
      <section className="space-y-2" key={title}>
        <h2 className="text-fg-muted text-sm font-semibold">{title}</h2>
        <ul className="border-border bg-surface space-y-1 rounded-lg border p-2">
          {renderTree(rows, null, 0)}
        </ul>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {canCreate && (
        <div className="border-border bg-surface flex flex-wrap gap-2 rounded-lg border p-3">
          <select
            aria-label="Document location"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            className="border-border bg-surface text-fg rounded border px-2 py-2 text-sm"
          >
            <option value="workspace">Workspace</option>
            {spaces.map((space) => (
              <option key={space.id} value={`space:${space.id}`}>
                {space.name}
              </option>
            ))}
            {projects.map((project) => (
              <option key={project.id} value={`project:${project.id}`}>
                {project.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Document template"
            value={template}
            onChange={(event) => setTemplate(event.target.value)}
            className="border-border bg-surface text-fg rounded border px-2 py-2 text-sm"
          >
            <option value="blank">Blank document</option>
            {presets.map((preset) => (
              <option key={preset.key} value={`preset:${preset.key}`}>
                {preset.name}
              </option>
            ))}
            {templates.map((item) => (
              <option key={item.id} value={`custom:${item.id}`}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending}
            onClick={create}
            className="bg-accent text-accent-fg focus-visible:outline-ring rounded px-3 py-2 text-sm font-medium focus-visible:outline-2 disabled:opacity-50"
          >
            {pending ? 'Creating…' : 'New document'}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      {documents.length === 0 ? (
        <p className="text-fg-muted text-sm">
          No documents yet. Create one to start your team wiki.
        </p>
      ) : (
        <>
          {documents.some((document) => document.favorite) && (
            <section className="space-y-2">
              <h2 className="text-fg-muted text-sm font-semibold">Favorites</h2>
              <ul className="border-border bg-surface rounded-lg border p-2">
                {documents
                  .filter((document) => document.favorite)
                  .map((document) => (
                    <li key={document.id}>
                      <Link
                        href={`/${orgSlug}/docs/${document.id}`}
                        className="text-fg hover:bg-surface-2 focus-visible:outline-ring block rounded px-2 py-1 text-sm focus-visible:outline-2"
                      >
                        ★ {document.title}
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          )}
          {section(
            'Workspace',
            documents.filter((document) => !document.spaceId && !document.projectId),
          )}
          {spaces.map((space) => (
            <div key={space.id} className="space-y-3">
              {section(
                space.name,
                documents.filter(
                  (document) => document.spaceId === space.id && !document.projectId,
                ),
              )}
              {projects
                .filter((project) => project.spaceId === space.id)
                .map((project) =>
                  section(
                    `${space.name} / ${project.name}`,
                    documents.filter((document) => document.projectId === project.id),
                  ),
                )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
