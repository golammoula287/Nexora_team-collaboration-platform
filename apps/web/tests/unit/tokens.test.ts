import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * The tokens live in @nexora/ui, but the test lives here: that package is
 * browser-only and has no Node types, and this check needs to read the
 * stylesheet as text. apps/web is the consumer, so it is the right place to
 * assert the palette it renders.
 */
const css = readFileSync(
  fileURLToPath(new URL('../../../../packages/ui/src/tokens/tokens.css', import.meta.url)),
  'utf8',
);

/**
 * The palette, checked as an invariant rather than by eye.
 *
 * A tone chosen against the page background can still fail against its own
 * `-soft` partner, which is where badges and status pills actually put it. That
 * is not a hypothetical: the first palette passed every review and shipped
 * `--danger` at 4.02:1 on `--danger-soft`, caught only when an axe run happened
 * to have an urgent task on screen. This test does not depend on which badge
 * rendered.
 *
 * WCAG 2.1 AA: 4.5:1 for body text, 3:1 for large text and UI boundaries.
 */

/** The declarations inside a single selector block. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`no ${selector} block in tokens.css`);

  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const declarations: Record<string, string> = {};

  for (const line of css.slice(open + 1, close).split('\n')) {
    const match = /^\s*(--[\w-]+)\s*:\s*([^;]+);/.exec(line);
    if (match?.[1] && match[2]) declarations[match[1]] = match[2].trim();
  }
  return declarations;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) throw new Error(`${hex} is not a six-digit hex colour`);

  const int = Number.parseInt(match[1], 16);
  return (
    0.2126 * channel((int >> 16) & 0xff) +
    0.7152 * channel((int >> 8) & 0xff) +
    0.0722 * channel(int & 0xff)
  );
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const TONES = ['accent', 'success', 'warning', 'danger', 'info'] as const;

const THEMES = [
  { name: 'light', selector: ':root', surface: '--surface', page: '--bg' },
  { name: 'dark', selector: '.dark', surface: '--surface', page: '--bg' },
] as const;

describe.each(THEMES)('$name palette', (theme) => {
  const tokens = block(theme.selector);

  function token(name: string): string {
    const value = tokens[name];
    if (!value) throw new Error(`${theme.selector} is missing ${name}`);
    return value;
  }

  it.each(TONES)('%s is legible on its own soft background', (tone) => {
    expect(contrast(token(`--${tone}`), token(`--${tone}-soft`))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(TONES)('%s is legible on the card surface', (tone) => {
    expect(contrast(token(`--${tone}`), token(theme.surface))).toBeGreaterThanOrEqual(4.5);
  });

  it('body and muted text are legible on both backgrounds', () => {
    for (const text of ['--fg', '--fg-muted', '--fg-subtle']) {
      for (const background of [theme.page, '--surface', '--surface-2']) {
        expect(
          contrast(token(text), token(background)),
          `${text} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('the accent foreground is legible on the accent', () => {
    expect(contrast(token('--accent-fg'), token('--accent'))).toBeGreaterThanOrEqual(4.5);
  });

  it('the focus ring is visible against every background it lands on', () => {
    // 3:1 - a ring is a UI boundary, not body text.
    for (const background of [theme.page, '--surface', '--surface-2']) {
      expect(contrast(token('--ring'), token(background)), background).toBeGreaterThanOrEqual(3);
    }
  });

  it('the strong border is visible against the surfaces it separates', () => {
    expect(contrast(token('--border-strong'), token('--surface'))).toBeGreaterThanOrEqual(1.4);
  });
});
