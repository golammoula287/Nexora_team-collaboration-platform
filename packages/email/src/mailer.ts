import { Resend } from 'resend';
import type { Rendered } from './templates/index.js';

/**
 * Sending is behind an interface so the vendor is swappable in one place, and
 * so tests and local development never touch the network.
 */

export interface OutgoingEmail extends Rendered {
  to: string;
}

export interface Mailer {
  send(email: OutgoingEmail): Promise<void>;
}

export interface MailerConfig {
  apiKey?: string | undefined;
  from: string;
  replyTo?: string | undefined;
}

/** Resend. Used whenever an API key is configured. */
export function createResendMailer(config: MailerConfig & { apiKey: string }): Mailer {
  const resend = new Resend(config.apiKey);

  return {
    async send(email) {
      const { error } = await resend.emails.send({
        from: config.from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(config.replyTo ? { replyTo: config.replyTo } : {}),
      });

      if (error) {
        // Surfaced, never swallowed: a silently undelivered invitation looks
        // exactly like a working one until a user complains.
        throw new Error(`Failed to send "${email.subject}" to ${email.to}: ${error.message}`);
      }
    },
  };
}

/**
 * Development fallback. Prints the link rather than sending, so sign-up and
 * invitations can be walked through end to end with no email provider at all.
 */
export function createConsoleMailer(): Mailer {
  return {
    async send(email) {
      const link = /https?:\/\/\S+/.exec(email.text)?.[0];
      console.warn(
        `\n[email] to: ${email.to}\n[email] subject: ${email.subject}` +
          (link ? `\n[email] link: ${link}` : '') +
          '\n',
      );
    },
  };
}

/** Collects messages in memory. For tests. */
export function createMemoryMailer(): Mailer & { sent: OutgoingEmail[] } {
  const sent: OutgoingEmail[] = [];
  return {
    sent,
    async send(email) {
      sent.push(email);
    },
  };
}

export function createMailer(config: MailerConfig): Mailer {
  return config.apiKey
    ? createResendMailer({ ...config, apiKey: config.apiKey })
    : createConsoleMailer();
}
