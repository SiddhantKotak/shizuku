import { httpError } from './errors.js';
import type { FastifyRequest } from 'fastify';
import type { RequestUser } from '../plugins/auth.js';

/**
 * Narrowing helper for routes that require authentication. The `verifyJWT`
 * preHandler decorates `req.user`, but TypeScript still types it as `RequestUser
 * | undefined` (the global Fastify augmentation can't express "this is set
 * after a preHandler"). Calling `requireUser(req)` returns the non-null user
 * or throws — which lets us keep `@typescript-eslint/no-non-null-assertion`
 * enforcing strictness everywhere else.
 *
 * Defensive throw: if a route forgets to add `verifyJWT` to its preHandler,
 * we get a clean 401 instead of a `TypeError: Cannot read properties of
 * undefined`.
 */
export function requireUser(req: FastifyRequest): RequestUser {
  if (!req.user) {
    throw httpError.unauthorized('invalid_token', 'Authentication required');
  }
  return req.user;
}
