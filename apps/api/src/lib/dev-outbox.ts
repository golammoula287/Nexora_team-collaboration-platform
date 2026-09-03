import { isProduction } from '../env.js';

/**
 * An in-memory record of the links the API has emailed.
 *
 * Verification, invitation, reset and magic links all arrive by email, so an
 * end-to-end test either needs a real mailbox or a way to read what was sent.
 * This is the second option: the mailer writes here, and a route reads it back.
 *
 * NEVER active in production - `remember` returns immediately and the route is
 * not mounted, so there is no path by which a real deployment exposes anyone's
 * sign-in link. Kept small and bounded so it cannot grow into a memory leak in
 * a long-running dev server.
 */
interface SentLink {
  to: string;
  url: string;
  subject: string;
  at: number;
}

const MAX_ENTRIES = 100;
const sent: SentLink[] = [];

export function remember(entry: Omit<SentLink, 'at'>): void {
  if (isProduction) return;

  sent.push({ ...entry, at: Date.now() });
  if (sent.length > MAX_ENTRIES) sent.shift();
}

/** The most recent link sent to an address, or undefined. */
export function lastLinkTo(email: string): SentLink | undefined {
  for (let i = sent.length - 1; i >= 0; i -= 1) {
    const entry = sent[i];
    if (entry?.to.toLowerCase() === email.toLowerCase()) return entry;
  }
  return undefined;
}

export function clearOutbox(): void {
  sent.length = 0;
}
