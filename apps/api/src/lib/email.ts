import {
  createMailer,
  magicLink,
  organizationInvite,
  otpCode,
  resetPassword,
  verifyEmail,
  type Rendered,
} from '@nexora/email';
import type { AuthEmail } from '@nexora/auth';
import { env } from '../env.js';

const mailer = createMailer({
  apiKey: env.RESEND_API_KEY,
  from: env.EMAIL_FROM ?? 'Nexora <noreply@localhost>',
  replyTo: env.EMAIL_REPLY_TO,
});

/**
 * Maps the plain messages `@nexora/auth` emits onto the designed templates in
 * `@nexora/email`.
 *
 * The auth package deliberately knows nothing about HTML - keeping it UI-free
 * is what lets it be constructed in a test with a two-line email sink.
 */
export async function sendEmail(email: AuthEmail): Promise<void> {
  const rendered = render(email);
  await mailer.send({ to: email.to, ...rendered });
}

function render(email: AuthEmail): Rendered {
  const url = email.url ?? '';
  const name = email.to.split('@')[0] ?? 'there';

  if (email.subject.includes('Verify')) return verifyEmail({ name, url });
  if (email.subject.includes('Reset')) return resetPassword({ name, url });
  if (email.subject.includes('invited you')) {
    const inviterName = email.text.split(' invited you')[0] ?? 'A teammate';
    const organizationName = email.subject.replace(' invited you to Nexora', '');
    return organizationInvite({ organizationName, inviterName, url });
  }
  if (email.subject.includes('sign-in link')) return magicLink({ url });
  if (email.subject.includes('code')) {
    const code = /\b(\d{6})\b/.exec(email.text)?.[1] ?? '';
    return otpCode({ code });
  }

  // Unknown message type: send it rather than dropping it.
  return { subject: email.subject, html: `<p>${email.text}</p>`, text: email.text };
}
