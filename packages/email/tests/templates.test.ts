import { describe, expect, it } from 'vitest';
import {
  createMemoryMailer,
  magicLink,
  organizationInvite,
  otpCode,
  resetPassword,
  verifyEmail,
} from '../src/index.js';

const templates = [
  ['verifyEmail', verifyEmail({ name: 'Ada', url: 'https://app.test/verify?token=abc' })],
  ['resetPassword', resetPassword({ name: 'Ada', url: 'https://app.test/reset?token=abc' })],
  [
    'organizationInvite',
    organizationInvite({
      organizationName: 'Northwind',
      inviterName: 'Ada',
      url: 'https://app.test/accept-invite?id=abc',
    }),
  ],
  ['magicLink', magicLink({ url: 'https://app.test/magic?token=abc' })],
  ['otpCode', otpCode({ code: '123456' })],
] as const;

describe('every template', () => {
  it.each(templates)('%s has a subject, html and a real text alternative', (_name, rendered) => {
    expect(rendered.subject.length).toBeGreaterThan(0);
    expect(rendered.html).toContain('<html');
    // Not a stripped-tags afterthought: the text part must carry the message.
    expect(rendered.text.length).toBeGreaterThan(20);
    expect(rendered.text).not.toContain('<');
  });

  it.each(templates)('%s puts the link in both parts', (name, rendered) => {
    if (name === 'otpCode') return;

    const match = /https:\/\/app\.test\/\S+/.exec(rendered.text);
    expect(match, 'the text part must contain the link').toBeTruthy();
    expect(rendered.html).toContain('https://app.test/');
  });
});

describe('escaping', () => {
  it('escapes a name that contains markup', () => {
    // Display names are user-controlled and end up in an inbox. An unescaped
    // one is a scripting hole in someone else's email client.
    const rendered = verifyEmail({
      name: '<script>alert(1)</script>',
      url: 'https://app.test/verify',
    });

    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;');
  });

  it('escapes an organization name and an inviter name', () => {
    const rendered = organizationInvite({
      organizationName: '"><img src=x onerror=alert(1)>',
      inviterName: "O'Brien & Sons",
      url: 'https://app.test/accept',
    });

    expect(rendered.html).not.toContain('<img src=x');
    expect(rendered.html).toContain('&amp;');
  });

  it('escapes a url that tries to break out of the attribute', () => {
    const rendered = magicLink({ url: 'https://app.test/x" onmouseover="alert(1)' });

    expect(rendered.html).not.toContain('" onmouseover="');
    expect(rendered.html).toContain('&quot;');
  });
});

describe('the memory mailer', () => {
  it('records what would have been sent', async () => {
    const mailer = createMemoryMailer();
    const rendered = magicLink({ url: 'https://app.test/magic' });

    await mailer.send({ to: 'ada@example.test', ...rendered });

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe('ada@example.test');
    expect(mailer.sent[0]?.subject).toBe(rendered.subject);
  });
});
