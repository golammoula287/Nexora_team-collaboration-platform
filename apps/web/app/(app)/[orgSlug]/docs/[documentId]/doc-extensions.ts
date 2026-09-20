import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion';

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  parseHTML: () => [{ tag: 'aside[data-callout]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'aside',
    mergeAttributes(HTMLAttributes, { 'data-callout': '', class: 'doc-callout' }),
    0,
  ],
});

export const Toggle = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'block+',
  defining: true,
  parseHTML: () => [{ tag: 'details[data-toggle]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'details',
    mergeAttributes(HTMLAttributes, { 'data-toggle': '', class: 'doc-toggle', open: 'open' }),
    ['summary', 'Details'],
    ['div', 0],
  ],
});

type MenuItem = { id: string; label: string };

/** One accessible popup implementation for @mentions and slash commands. */
export function suggestionMenu<T extends MenuItem>() {
  let element: HTMLDivElement | null = null;
  let unmount: (() => void) | null = null;
  let current: SuggestionProps<T, T> | null = null;
  let selected = 0;
  const draw = (props: SuggestionProps<T, T>) => {
    current = props;
    if (!element) return;
    element.replaceChildren();
    element.setAttribute('role', 'listbox');
    element.setAttribute('aria-label', 'Editor suggestions');
    props.items.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === selected));
      button.className = 'doc-suggestion-item';
      button.onmousedown = (event) => {
        event.preventDefault();
        props.command(item);
      };
      element?.append(button);
    });
  };
  return {
    onStart(props: SuggestionProps<T, T>) {
      selected = 0;
      element = document.createElement('div');
      element.className = 'doc-suggestion-menu';
      unmount = props.mount(element);
      draw(props);
    },
    onUpdate(props: SuggestionProps<T, T>) {
      selected = 0;
      draw(props);
    },
    onKeyDown({ event }: { event: KeyboardEvent }) {
      if (event.key === 'Escape') return true;
      if (!current?.items.length) return false;
      if (event.key === 'ArrowDown') {
        selected = (selected + 1) % current.items.length;
        draw(current);
        return true;
      }
      if (event.key === 'ArrowUp') {
        selected = (selected - 1 + current.items.length) % current.items.length;
        draw(current);
        return true;
      }
      if (event.key === 'Enter') {
        const item = current.items[selected];
        if (item) current.command(item);
        return true;
      }
      return false;
    },
    onExit() {
      unmount?.();
      unmount = null;
      element = null;
      current = null;
    },
  };
}

export const SLASH_ITEMS: MenuItem[] = [
  { id: 'heading', label: 'Heading' },
  { id: 'bullet', label: 'Bullet list' },
  { id: 'numbered', label: 'Numbered list' },
  { id: 'quote', label: 'Quote' },
  { id: 'code', label: 'Code block' },
  { id: 'table', label: 'Table' },
  { id: 'callout', label: 'Callout' },
  { id: 'toggle', label: 'Toggle' },
  { id: 'math', label: 'Math block' },
];

export function runSlashCommand(editor: Editor, id: string) {
  if (id === 'heading') editor.chain().focus().setHeading({ level: 2 }).run();
  if (id === 'bullet') editor.chain().focus().toggleBulletList().run();
  if (id === 'numbered') editor.chain().focus().toggleOrderedList().run();
  if (id === 'quote') editor.chain().focus().toggleBlockquote().run();
  if (id === 'code') editor.chain().focus().toggleCodeBlock().run();
  if (id === 'table')
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  if (id === 'callout')
    editor
      .chain()
      .focus()
      .insertContent({ type: 'callout', content: [{ type: 'paragraph' }] })
      .run();
  if (id === 'toggle')
    editor
      .chain()
      .focus()
      .insertContent({ type: 'toggle', content: [{ type: 'paragraph' }] })
      .run();
  if (id === 'math') editor.chain().focus().insertBlockMath({ latex: 'x^2' }).run();
}

export const SlashCommands = Extension.create({
  name: 'slashCommands',
  addProseMirrorPlugins() {
    return [
      Suggestion<MenuItem, MenuItem>({
        editor: this.editor,
        pluginKey: new PluginKey('docSlashCommands'),
        char: '/',
        startOfLine: true,
        items: ({ query }) =>
          SLASH_ITEMS.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())),
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run();
          runSlashCommand(editor, props.id);
        },
        render: suggestionMenu<MenuItem>,
      }),
    ];
  },
});
