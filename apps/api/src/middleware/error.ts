import { HTTPException } from 'hono/http-exception';
import type { ErrorHandler, NotFoundHandler } from 'hono';
import { isProduction } from '../env.js';

/** The error shape every failing request returns. The frontend can rely on it. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    /** Field-level detail, present only on a 400 from Zod validation. */
    issues?: { path: string; message: string }[];
  };
}

const CODE_BY_STATUS: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  429: 'rate_limited',
  500: 'internal_error',
  501: 'not_implemented',
};

export const onError: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    const status = err.status;
    return c.json<ApiError>(
      { error: { code: CODE_BY_STATUS[status] ?? 'error', message: err.message } },
      status,
    );
  }

  // Unexpected: log it in full, tell the client nothing useful to an attacker.
  console.error('[api] unhandled error', err);
  return c.json<ApiError>(
    {
      error: {
        code: 'internal_error',
        message: isProduction ? 'Something went wrong.' : String(err),
      },
    },
    500,
  );
};

export const onNotFound: NotFoundHandler = (c) =>
  c.json<ApiError>(
    { error: { code: 'not_found', message: `No route for ${c.req.method} ${c.req.path}` } },
    404,
  );
