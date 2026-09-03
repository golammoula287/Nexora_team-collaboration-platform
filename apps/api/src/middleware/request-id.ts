import { createMiddleware } from 'hono/factory';
import { randomUUID } from 'node:crypto';
import type { AppBindings } from '../types/context.js';

/** Tags every request so a log line can be traced to a response. */
export const requestId = createMiddleware<AppBindings>(async (c, next) => {
  const id = c.req.header('x-request-id') ?? randomUUID();
  c.set('requestId', id);
  c.header('X-Request-Id', id);
  await next();
});
