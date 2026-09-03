/**
 * Email layout.
 *
 * Deliberately plain: table-free, inline styles only, no web fonts, no images,
 * and a real plain-text alternative for every message. Email clients are a
 * decade behind browsers, and a transactional email that fails to render is a
 * user who cannot sign in.
 *
 * Colours are the light-mode tokens from docs/UI.md, inlined because email has
 * no CSS variables.
 */

const FG = '#14161a';
const FG_MUTED = '#5b6270';
const BORDER = '#e6e8ec';
const ACCENT = '#4f46e5';
const BG = '#fbfbfc';

export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

export interface LayoutInput {
  preheader: string;
  heading: string;
  /** Paragraphs of body copy, in order. */
  body: string[];
  action?: { label: string; url: string };
  /** Shown small and muted under the action. */
  footnote?: string;
}

/** Escapes interpolated values; every template passes user-controlled text. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderLayout(input: LayoutInput): { html: string; text: string } {
  const paragraphs = input.body
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:14px;line-height:22px;color:${FG};">${escapeHtml(p)}</p>`,
    )
    .join('');

  const button = input.action
    ? `<p style="margin:24px 0;">
         <a href="${escapeHtml(input.action.url)}"
            style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;
                   padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600;">
           ${escapeHtml(input.action.label)}
         </a>
       </p>
       <p style="margin:0 0 16px;font-size:12px;line-height:18px;color:${FG_MUTED};">
         If the button does not work, paste this into your browser:<br />
         <span style="word-break:break-all;">${escapeHtml(input.action.url)}</span>
       </p>`
    : '';

  const footnote = input.footnote
    ? `<p style="margin:16px 0 0;font-size:12px;line-height:18px;color:${FG_MUTED};">${escapeHtml(input.footnote)}</p>`
    : '';

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <span style="display:none;font-size:1px;color:${BG};">${escapeHtml(input.preheader)}</span>
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid ${BORDER};border-radius:8px;padding:28px;">
      <p style="margin:0 0 20px;font-size:15px;font-weight:600;color:${FG};letter-spacing:-0.01em;">Nexora</p>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:28px;font-weight:600;color:${FG};">${escapeHtml(input.heading)}</h1>
      ${paragraphs}
      ${button}
      ${footnote}
    </div>
    <p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:18px;color:${FG_MUTED};text-align:center;">
      You are receiving this because someone used this address to sign in to Nexora.
    </p>
  </body>
</html>`;

  const text = [
    input.heading,
    '',
    ...input.body,
    ...(input.action ? ['', `${input.action.label}: ${input.action.url}`] : []),
    ...(input.footnote ? ['', input.footnote] : []),
  ].join('\n');

  return { html, text };
}
