import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { isProduction } from '../env.js';
import { clearOutbox, lastLinkTo } from '../lib/dev-outbox.js';
import type { AppBindings } from '../types/context.js';

/**
 * TEST-ONLY ROUTES.
 *
 * Mounted by `createApp` only when NODE_ENV is not production, and every
 * handler refuses again at request time. Two independent guards, because a
 * route that hands out sign-in links is exactly the kind of thing that must not
 * survive a configuration mistake.
 *
 * These exist so the phase 2 journey test can read the links the mailer would
 * have sent, without an email provider being configured.
 */
export function devRoute() {
  return new Hono<AppBindings>()
    .get('/__test/last-link', (c) => {
      if (isProduction) throw new HTTPException(404, { message: 'Not found.' });

      const email = c.req.query('email');
      if (!email) throw new HTTPException(400, { message: 'email is required' });

      const entry = lastLinkTo(email);
      return c.json({ url: entry?.url ?? null, subject: entry?.subject ?? null });
    })
    .post('/__test/clear-outbox', (c) => {
      if (isProduction) throw new HTTPException(404, { message: 'Not found.' });

      clearOutbox();
      return c.json({ cleared: true });
    });
}
