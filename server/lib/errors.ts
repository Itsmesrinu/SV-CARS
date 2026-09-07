/**
 * The single error vocabulary for the whole API (CONTRACT.md §8).
 *
 * Every failure leaves this server as `{ error: { code, message } }` and nothing
 * else. No stack trace, no Postgres message, no connection string: the real
 * cause is logged server-side and the client gets a stable machine-readable
 * `code` plus a sentence the owner could read out loud.
 *
 * Owned by P01.
 */

import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ZodError } from 'zod';
import type { ApiError } from '../../src/types/api';

/** Stable machine-readable codes. P03's client switches on these, so they are frozen. */
export type ApiErrorCode =
  | 'unauthorized'
  | 'invalid_credentials'
  | 'not_found'
  | 'validation_failed'
  | 'conflict'
  | 'internal';

/**
 * Throw one of these from anywhere in a handler; `onError` turns it into the
 * `ApiError` body with the right status. Handlers therefore never have to
 * remember the response shape, which is why the shape cannot drift.
 */
export class HttpError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ApiErrorCode;

  constructor(status: ContentfulStatusCode, code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export const unauthorized = (message = 'Sign in to continue.') =>
  new HttpError(401, 'unauthorized', message);

export const invalidCredentials = (message = 'Incorrect email or password.') =>
  new HttpError(401, 'invalid_credentials', message);

export const notFound = (message = 'Not found.') => new HttpError(404, 'not_found', message);

export const conflict = (message: string) => new HttpError(409, 'conflict', message);

export const validationFailed = (message: string) =>
  new HttpError(422, 'validation_failed', message);

export const internal = (message = 'Something went wrong.') =>
  new HttpError(500, 'internal', message);

/** The wire body. Typed against the shared DTO so it cannot drift from §3. */
export function errorBody(code: ApiErrorCode, message: string): ApiError {
  return { error: { code, message } };
}

/**
 * A zod failure becomes `422 validation_failed` with the offending field path
 * in the message — `pricePerDay: must be a whole number of rupees` — so the
 * admin form can point at the field instead of showing "invalid input".
 */
export function validationError(error: ZodError): HttpError {
  const issue = error.issues[0];
  if (!issue) return validationFailed('Invalid request body.');
  const path = issue.path.map(String).join('.');
  return validationFailed(path ? `${path}: ${issue.message}` : issue.message);
}

/**
 * Maps everything that escapes a handler.
 *
 * The `else` branch is the one that matters: an unexpected throw (a dropped Neon
 * connection, a typo in a query) must log the real cause for us and return a
 * generic sentence to the client. Leaking `error.message` here is how a
 * connection string ends up in someone's browser console.
 */
export const onError: ErrorHandler = (err, c) => {
  if (err instanceof HttpError) {
    return c.json(errorBody(err.code, err.message), err.status);
  }

  console.error('[api] unhandled error', {
    method: c.req.method,
    path: c.req.path,
    error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  return c.json(errorBody('internal', 'Something went wrong.'), 500);
};

/** Unmatched routes answer in the same shape as everything else, never HTML. */
export const notFoundHandler: NotFoundHandler = (c) =>
  c.json(errorBody('not_found', `No route for ${c.req.method} ${c.req.path}.`), 404);

/** Narrow helper for handlers that want to answer directly instead of throwing. */
export function errorResponse(c: Context, err: HttpError) {
  return c.json(errorBody(err.code, err.message), err.status);
}