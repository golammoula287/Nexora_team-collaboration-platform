'use client';

import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { Image } from '@tiptap/extension-image';
import { Mention } from '@tiptap/extension-mention';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { Youtube } from '@tiptap/extension-youtube';
import { Mathematics } from '@tiptap/extension-mathematics';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import type { LiveblocksYjsProvider } from '@liveblocks/yjs';
import { common, createLowlight } from 'lowlight';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../../../../lib/api';
import { Callout, SlashCommands, Toggle, suggestionMenu } from './doc-extensions';
import { textDiff } from './text-diff';

type Document = {
  id: string;
  title: string;
  content: unknown;
  contentText: string;
};
type Version = {
  id: string;
  title: string;
  contentText: string;
  createdAt: string;
  content: unknown;
};
type Annotation = {
  id: string;
  bodyText: string;
  selectionFrom: number | null;
  selectionTo: number | null;
  selectionQuote: string | null;
  suggestion: unknown;
  resolvedAt: string | null;
};

export type DocumentEditorProps = {
  orgSlug: string;
  document: Document;
  canEdit: boolean;
  members: { id: string; label: string }[];
  collaboration?: { provider: LiveblocksYjsProvider; name: string; color: string };
  collaborators?: { id: number; name: string }[];
};

export function DocumentEditor({
  orgSlug,
  document,
  canEdit,
  members,
  collaboration,
  collaborators = [],
}: DocumentEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(document.title);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [comparedVersion, setComparedVersion] = useState<Version | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[] | null>(null);
  const [selectedText, setSelectedText] = useState<{
    from: number;
    to: number;
    quote: string;
  } | null>(null);
  const [comment, setComment] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, ...(collaboration ? { undoRedo: false } : {}) }),
      ...(collaboration
        ? [
            Collaboration.configure({ document: collaboration.provider.getYDoc() }),
            CollaborationCaret.configure({
              provider: collaboration.provider,
              user: { name: collaboration.name, color: collaboration.color },
            }),
          ]
        : []),
      CodeBlockLowlight.configure({ lowlight: createLowlight(common) }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image,
      Youtube.configure({ controls: true }),
      Mathematics,
      Callout,
      Toggle,
      SlashCommands,
      Mention.configure({
        HTMLAttributes: { class: 'doc-mention' },
        suggestion: {
          char: '@',
          items: ({ query }) =>
            members
              .filter((member) => member.label.toLowerCase().includes(query.toLowerCase()))
              .slice(0, 8),
          render: suggestionMenu<{ id: string; label: string }>,
        },
      }),
    ],
    ...(!collaboration
      ? { content: (document.content ?? { type: 'doc', content: [] }) as JSONContent }
      : {}),
    editable: canEdit,
    immediatelyRender: false,
    onUpdate: () => setDirty(true),
    editorProps: { attributes: { class: 'doc-editor min-h-80 px-5 py-4 text-fg outline-none' } },
  });

  useEffect(() => {
    if (!collaboration || !editor) return;
    const provider = collaboration.provider;
    const seed = (synced: boolean) => {
      if (!synced || !canEdit) return;
      const fragment = provider.getYDoc().getXmlFragment('default');
      if (fragment.length === 0 && document.content) {
        editor.commands.setContent(document.content as JSONContent);
        setDirty(false);
      }
    };
    provider.on('sync', seed);
    if (provider.synced) seed(true);
    return () => provider.off('sync', seed);
  }, [collaboration, editor, canEdit, document.content]);

  function insertImage() {
    if (!editor) return;
    const source = window.prompt('Image URL (https://)');
    if (!source) return;
    try {
      if (new URL(source).protocol !== 'https:') throw new Error('URL');
      editor.chain().focus().setImage({ src: source }).run();
    } catch {
      setStatus('Use an HTTPS image URL.');
    }
  }

  function insertVideo() {
    if (!editor) return;
    const source = window.prompt('YouTube URL');
    if (source && !editor.chain().focus().setYoutubeVideo({ src: source }).run())
      setStatus('Use a valid YouTube URL.');
  }

  function insertMath() {
    if (!editor) return;
    const latex = window.prompt('LaTeX formula');
    if (latex) editor.chain().focus().insertBlockMath({ latex }).run();
  }

  async function save() {
    if (!editor || !title.trim()) return false;
    setSaving(true);
    setStatus('');
    try {
      const response = await api.orgs[':orgSlug'].documents[':documentId'].$patch({
        param: { orgSlug, documentId: document.id },
        json: { title: title.trim(), content: editor.getJSON(), contentText: editor.getText() },
      });
      if (!response.ok) throw new Error('Save failed');
      setDirty(false);
      setStatus('Saved');
      router.refresh();
      return true;
    } catch {
      setStatus('Could not save. Try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveTemplate() {
    const name = window.prompt('Template name', title);
    if (!name?.trim()) return;
    if (dirty && !(await save())) return;
    const response = await api.orgs[':orgSlug']['document-templates'].$post({
      param: { orgSlug },
      json: { documentId: document.id, name: name.trim() },
    });
    setStatus(
      response.ok ? 'Template saved. Find it in New document.' : 'Could not save template.',
    );
  }

  function captureSelection() {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const quote = editor.state.doc.textBetween(from, to, ' ');
    if (from === to || !quote.trim()) {
      setStatus('Select text in the document first.');
      return;
    }
    setSelectedText({ from, to, quote });
  }

  async function loadAnnotations() {
    const response = await api.orgs[':orgSlug'].documents[':documentId'].annotations.$get({
      param: { orgSlug, documentId: document.id },
    });
    if (!response.ok) {
      setStatus('Could not load comments.');
      return;
    }
    const data = await response.json();
    setAnnotations(
      data.annotations.map((item) => ({
        ...item,
        resolvedAt: item.resolvedAt ? String(item.resolvedAt) : null,
      })),
    );
  }

  async function addAnnotation() {
    if (!selectedText || !comment.trim()) return;
    if (dirty && !(await save())) return;
    const response = await api.orgs[':orgSlug'].documents[':documentId'].annotations.$post({
      param: { orgSlug, documentId: document.id },
      json: {
        bodyText: comment.trim(),
        selectionFrom: selectedText.from,
        selectionTo: selectedText.to,
        selectionQuote: selectedText.quote,
        ...(suggestion.trim() ? { suggestion: suggestion.trim() } : {}),
      },
    });
    if (!response.ok) {
      setStatus('Could not add comment.');
      return;
    }
    setSelectedText(null);
    setComment('');
    setSuggestion('');
    await loadAnnotations();
  }

  async function resolveAnnotation(annotation: Annotation, resolved: boolean) {
    const response = await api.orgs[':orgSlug'].documents[':documentId'].annotations[
      ':annotationId'
    ].$patch({
      param: { orgSlug, documentId: document.id, annotationId: annotation.id },
      json: { resolved },
    });
    if (!response.ok) {
      setStatus('Could not update comment.');
      return;
    }
    await loadAnnotations();
  }

  async function acceptSuggestion(annotation: Annotation) {
    if (!editor || annotation.selectionFrom === null || annotation.selectionTo === null) return;
    const replacement =
      typeof annotation.suggestion === 'object' &&
      annotation.suggestion !== null &&
      'text' in annotation.suggestion
        ? annotation.suggestion.text
        : null;
    if (typeof replacement !== 'string') return;
    const current = editor.state.doc.textBetween(
      annotation.selectionFrom,
      annotation.selectionTo,
      ' ',
    );
    if (current !== annotation.selectionQuote) {
      setStatus('The selected text changed. Review the suggestion before applying it.');
      return;
    }
    editor
      .chain()
      .focus()
      .insertContentAt({ from: annotation.selectionFrom, to: annotation.selectionTo }, replacement)
      .run();
    if (await save()) await resolveAnnotation(annotation, true);
  }

  async function loadVersions() {
    const response = await api.orgs[':orgSlug'].documents[':documentId'].versions.$get({
      param: { orgSlug, documentId: document.id },
    });
    if (!response.ok) {
      setStatus('Could not load version history.');
      return;
    }
    const data = await response.json();
    setVersions(
      data.versions.map((version) => ({ ...version, createdAt: String(version.createdAt) })),
    );
  }

  async function restore(versionId: string) {
    if (
      !canEdit ||
      !editor ||
      !window.confirm('Restore this version? Your current saved version stays in history.')
    )
      return;
    const response = await api.orgs[':orgSlug'].documents[':documentId'].versions[
      ':versionId'
    ].restore.$post({
      param: { orgSlug, documentId: document.id, versionId },
    });
    if (!response.ok) {
      setStatus('Could not restore version.');
      return;
    }
    const { document: restored } = await response.json();
    setTitle(restored.title);
    editor.commands.setContent((restored.content ?? { type: 'doc', content: [] }) as JSONContent);
    setDirty(false);
    setStatus('Version restored');
    await loadVersions();
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link
        href={`/${orgSlug}/docs`}
        className="text-fg-muted hover:text-fg focus-visible:outline-ring text-sm focus-visible:outline-2"
      >
        ← All docs
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <input
          aria-label="Document title"
          value={title}
          disabled={!canEdit}
          onChange={(event) => {
            setTitle(event.target.value);
            setDirty(true);
          }}
          className="text-fg focus-visible:ring-ring min-w-0 flex-1 border-0 bg-transparent text-2xl font-semibold outline-none focus-visible:ring-2"
        />
        {canEdit && (
          <>
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty || !title.trim()}
              className="bg-accent text-accent-fg focus-visible:outline-ring rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={saveTemplate}
              className="border-border text-fg focus-visible:outline-ring rounded-md border px-3 py-2 text-sm focus-visible:outline-2"
            >
              Save as template
            </button>
          </>
        )}
        <span role="status" className="text-fg-muted text-sm">
          {status}
        </span>
        {collaboration && <span className="text-fg-muted text-xs">Live collaboration</span>}
        {collaborators.length > 0 && (
          <span className="text-fg-muted text-xs" aria-label="People editing this document">
            {collaborators.map((person) => person.name).join(', ')}
          </span>
        )}
      </div>
      {canEdit && editor && (
        <div
          role="toolbar"
          aria-label="Text formatting"
          className="border-border bg-surface flex flex-wrap gap-1 rounded-md border p-2"
        >
          <button
            type="button"
            aria-label="Bold"
            aria-pressed={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            className="text-fg hover:bg-surface-2 focus-visible:outline-ring rounded px-2 py-1 text-sm focus-visible:outline-2"
          >
            Bold
          </button>
          <button
            type="button"
            aria-label="Italic"
            aria-pressed={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className="text-fg hover:bg-surface-2 focus-visible:outline-ring rounded px-2 py-1 text-sm focus-visible:outline-2"
          >
            Italic
          </button>
          <button
            type="button"
            aria-label="Heading"
            aria-pressed={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className="text-fg hover:bg-surface-2 focus-visible:outline-ring rounded px-2 py-1 text-sm focus-visible:outline-2"
          >
            Heading
          </button>
          <button
            type="button"
            aria-label="Bullet list"
            aria-pressed={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className="text-fg hover:bg-surface-2 focus-visible:outline-ring rounded px-2 py-1 text-sm focus-visible:outline-2"
          >
            List
          </button>
          <button
            type="button"
            aria-label="Code block"
            aria-pressed={editor.isActive('codeBlock')}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className="text-fg hover:bg-surface-2 focus-visible:outline-ring rounded px-2 py-1 text-sm focus-visible:outline-2"
          >
            Code
          </button>
          <button
            type="button"
            aria-label="Insert table"
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
            className="text-fg hover:bg-surface-2 focus-visible:outline-ring rounded px-2 py-1 text-sm focus-visible:outline-2"
          >
            Table
          </button>
          <button
            type="button"
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertContent({ type: 'callout', content: [{ type: 'paragraph' }] })
                .run()
            }
            className="text-fg hover:bg-surface-2 focus-visible:outline-ring rounded px-2 py-1 text-sm focus-visible:outline-2"
          >
            Callout
          </button>
          <button
            type="button"
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertContent({ type: 'toggle', content: [{ type: 'paragraph' }] })
                .run()
            }
            className="text-fg hover:bg-surface-2 focus-visible:outline-ring rounded px-2 py-1 text-sm focus-visible:outline-2"
          >
            Toggle
          </button>
          <button
            type="button"
            onClick={insertImage}
            className="text-fg hover:bg-surface-2 focus-visible:outline-ring rounded px-2 py-1 text-sm focus-visible:outline-2"
          >
            Image
          </button>
          <button
            type="button"
            onClick={insertVideo}
            className="text-fg hover:bg-surface-2 focus-visible:outline-ring rounded px-2 py-1 text-sm focus-visible:outline-2"
          >
            Video
          </button>
          <button
            type="button"
            onClick={insertMath}
            className="text-fg hover:bg-surface-2 focus-visible:outline-ring rounded px-2 py-1 text-sm focus-visible:outline-2"
          >
            Math
          </button>
          <span className="text-fg-muted self-center px-2 text-xs">
            Type / for blocks or @ to mention
          </span>
        </div>
      )}
      <div className="border-border bg-surface focus-within:ring-ring rounded-md border focus-within:ring-2">
        <EditorContent editor={editor} aria-label="Document content" />
      </div>
      <section
        className="border-border space-y-3 border-t pt-5"
        aria-label="Selection comments and suggestions"
      >
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={captureSelection}
              className="border-border text-fg focus-visible:outline-ring rounded border px-3 py-1 text-sm focus-visible:outline-2"
            >
              Comment on selection
            </button>
          )}
          <button
            type="button"
            onClick={loadAnnotations}
            className="border-border text-fg focus-visible:outline-ring rounded border px-3 py-1 text-sm focus-visible:outline-2"
          >
            Show comments
          </button>
        </div>
        {selectedText && (
          <div className="border-border bg-surface space-y-2 rounded-md border p-3">
            <p className="text-fg-muted text-sm">Selected: “{selectedText.quote.slice(0, 160)}”</p>
            <textarea
              aria-label="Comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={2}
              className="border-border bg-surface text-fg w-full rounded border p-2 text-sm"
              placeholder="Your comment"
            />
            <textarea
              aria-label="Suggested replacement"
              value={suggestion}
              onChange={(event) => setSuggestion(event.target.value)}
              rows={2}
              className="border-border bg-surface text-fg w-full rounded border p-2 text-sm"
              placeholder="Suggested replacement (optional)"
            />
            <button
              type="button"
              onClick={addAnnotation}
              disabled={!comment.trim()}
              className="bg-accent text-accent-fg rounded px-3 py-2 text-sm disabled:opacity-50"
            >
              Post
            </button>
          </div>
        )}
        {annotations &&
          (annotations.length === 0 ? (
            <p className="text-fg-muted text-sm">No comments yet.</p>
          ) : (
            <ul className="space-y-2">
              {annotations.map((annotation) => (
                <li
                  key={annotation.id}
                  className="border-border bg-surface rounded-md border p-3 text-sm"
                >
                  <button
                    type="button"
                    onClick={() =>
                      annotation.selectionFrom !== null &&
                      annotation.selectionTo !== null &&
                      editor
                        ?.chain()
                        .focus()
                        .setTextSelection({
                          from: annotation.selectionFrom,
                          to: annotation.selectionTo,
                        })
                        .run()
                    }
                    className="text-fg-muted text-left hover:underline"
                  >
                    “{annotation.selectionQuote}”
                  </button>
                  <p className="text-fg mt-1">{annotation.bodyText}</p>
                  {typeof annotation.suggestion === 'object' &&
                    annotation.suggestion !== null &&
                    'text' in annotation.suggestion && (
                      <p className="text-fg-muted mt-1">
                        Suggested: {String(annotation.suggestion.text)}
                      </p>
                    )}
                  <div className="mt-2 flex gap-3 text-xs">
                    <span className="text-fg-muted">
                      {annotation.resolvedAt ? 'Resolved' : 'Open'}
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => resolveAnnotation(annotation, !annotation.resolvedAt)}
                        className="text-fg hover:underline"
                      >
                        {annotation.resolvedAt ? 'Reopen' : 'Resolve'}
                      </button>
                    )}
                    {canEdit && !annotation.resolvedAt && Boolean(annotation.suggestion) && (
                      <button
                        type="button"
                        onClick={() => acceptSuggestion(annotation)}
                        className="text-fg hover:underline"
                      >
                        Accept suggestion
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ))}
      </section>
      <section className="border-border space-y-3 border-t pt-5" aria-label="Version history">
        <button
          type="button"
          onClick={loadVersions}
          className="text-fg focus-visible:outline-ring text-sm font-medium hover:underline focus-visible:outline-2"
        >
          Version history
        </button>
        {versions &&
          (versions.length === 0 ? (
            <p className="text-fg-muted text-sm">No saved versions yet.</p>
          ) : (
            <ul className="space-y-2">
              {versions.map((version) => (
                <li
                  key={version.id}
                  className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
                >
                  <div>
                    <strong className="text-fg">{version.title}</strong>
                    <p className="text-fg-muted">
                      {new Date(version.createdAt).toLocaleString()} ·{' '}
                      {version.contentText.slice(0, 100)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setComparedVersion(version)}
                    className="text-fg focus-visible:outline-ring hover:underline focus-visible:outline-2"
                  >
                    Compare
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => restore(version.id)}
                      className="text-fg focus-visible:outline-ring hover:underline focus-visible:outline-2"
                    >
                      Restore
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ))}
        {comparedVersion && (
          <div className="border-border bg-surface space-y-2 rounded-md border p-3">
            <h3 className="text-fg text-sm font-semibold">
              Changes from {comparedVersion.title} to current
            </h3>
            <p className="text-fg text-sm whitespace-pre-wrap">
              {textDiff(comparedVersion.contentText, editor?.getText() ?? document.contentText).map(
                (part, index) =>
                  part.kind === 'same' ? (
                    <span key={index}>{part.text}</span>
                  ) : part.kind === 'added' ? (
                    <ins key={index} className="bg-success-soft text-success">
                      {part.text}
                    </ins>
                  ) : (
                    <del key={index} className="bg-danger-soft text-danger">
                      {part.text}
                    </del>
                  ),
              )}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
