import { renderLayout, type Rendered } from './layout.js';

/**
 * One function per transactional email. Each returns subject, HTML and a real
 * plain-text alternative - not a stripped-tags afterthought.
 */

export function verifyEmail(input: { name: string; url: string }): Rendered {
  const { html, text } = renderLayout({
    preheader: 'Confirm your email address to finish setting up Nexora.',
    heading: 'Confirm your email',
    body: [`Hi ${input.name},`, 'Confirm this address to finish setting up your Nexora account.'],
    action: { label: 'Confirm email', url: input.url },
    footnote: 'This link expires in 1 hour. If you did not sign up, ignore this email.',
  });

  return { subject: 'Confirm your Nexora email', html, text };
}

export function resetPassword(input: { name: string; url: string }): Rendered {
  const { html, text } = renderLayout({
    preheader: 'Reset your Nexora password.',
    heading: 'Reset your password',
    body: [
      `Hi ${input.name},`,
      'Use the link below to choose a new password. Signing in again everywhere else will be required afterwards.',
    ],
    action: { label: 'Reset password', url: input.url },
    footnote:
      'This link expires in 1 hour. If you did not ask for this, ignore it - your password will not change.',
  });

  return { subject: 'Reset your Nexora password', html, text };
}

export function organizationInvite(input: {
  organizationName: string;
  inviterName: string;
  url: string;
}): Rendered {
  const { html, text } = renderLayout({
    preheader: `${input.inviterName} invited you to ${input.organizationName} on Nexora.`,
    heading: `Join ${input.organizationName}`,
    body: [
      `${input.inviterName} invited you to work with them in ${input.organizationName} on Nexora.`,
    ],
    action: { label: 'Accept invitation', url: input.url },
    footnote: 'This invitation expires in 7 days.',
  });

  return { subject: `${input.inviterName} invited you to ${input.organizationName}`, html, text };
}

export function magicLink(input: { url: string }): Rendered {
  const { html, text } = renderLayout({
    preheader: 'Your sign-in link for Nexora.',
    heading: 'Sign in to Nexora',
    body: ['Use the link below to sign in. No password needed.'],
    action: { label: 'Sign in', url: input.url },
    footnote: 'This link expires in 5 minutes and can be used once.',
  });

  return { subject: 'Your Nexora sign-in link', html, text };
}

export function otpCode(input: { code: string }): Rendered {
  const { html, text } = renderLayout({
    preheader: 'Your Nexora verification code.',
    heading: 'Your verification code',
    body: [`Your code is ${input.code}.`, 'It expires in 3 minutes.'],
    footnote: 'If you did not try to sign in, change your password.',
  });

  return { subject: `${input.code} is your Nexora code`, html, text };
}

export type { Rendered };
