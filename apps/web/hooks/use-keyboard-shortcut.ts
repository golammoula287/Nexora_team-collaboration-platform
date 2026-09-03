'use client';

import { useEffect } from 'react';

export interface Shortcut {
  /** Lower-case key, e.g. 'k'. */
  key: string;
  /** Cmd on macOS, Ctrl elsewhere. */
  mod?: boolean;
  shift?: boolean;
  handler: (event: KeyboardEvent) => void;
}

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** True when the user is typing, so a bare letter shortcut must not fire. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return EDITABLE.has(target.tagName) || target.isContentEditable;
}

/**
 * Global keyboard shortcuts.
 *
 * Modified shortcuts (Cmd+K) fire everywhere; unmodified ones are suppressed
 * while typing, so pressing "n" in a comment box writes an n rather than
 * opening a New Task dialog.
 */
export function useKeyboardShortcut(shortcuts: Shortcut[]): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const usesMod = event.metaKey || event.ctrlKey;

      for (const shortcut of shortcuts) {
        if (event.key.toLowerCase() !== shortcut.key) continue;
        if (Boolean(shortcut.mod) !== usesMod) continue;
        if (Boolean(shortcut.shift) !== event.shiftKey) continue;
        if (!shortcut.mod && isTyping(event.target)) continue;

        event.preventDefault();
        shortcut.handler(event);
        return;
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [shortcuts]);
}

/** Cmd on Apple platforms, Ctrl elsewhere. Rendered in shortcut hints. */
export function modKeyLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl';
  return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';
}
