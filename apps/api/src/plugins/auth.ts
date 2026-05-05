import fp from 'fastify-plugin';
import { eq } from 'drizzle-orm';
import { users } from '@shizuku/db/schema';
import { httpError } from '../lib/errors.js';
import { verifyAccessToken } from '../services/auth/jwt.js';
import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';

export interface RequestUser {
  id: string;
  tokenVersion: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: RequestUser;
  }
  interface FastifyInstance {
    /** preHandler that requires a valid access token; sets request.user. */
    verifyJWT: preHandlerAsyncHookHandler;
    /** preHandler that reads token if present, but doesn't require it. */
    optionalJWT: preHandlerAsyncHookHandler;
  }
}

export default fp(async (app: FastifyInstance) => {
  app.decorate('verifyJWT', async (req: FastifyRequest) => {
    const token = readBearerToken(req);
    if (!token) throw httpError.unauthorized('invalid_token', 'Missing bearer token');
    const claims = await verifyAccessToken(token);

    // Validate the user still exists AND their tokenVersion matches.
    // tokenVersion mismatch = global revoke happened (password reset, etc.)
    const [row] = await app.db
      .select({ id: users.id, tokenVersion: users.tokenVersion })
      .from(users)
      .where(eq(users.id, claims.sub))
      .limit(1);
    if (!row || row.tokenVersion !== claims.ver) {
      throw httpError.unauthorized('invalid_token', 'Token no longer valid');
    }
    req.user = { id: row.id, tokenVersion: row.tokenVersion };
  });

  app.decorate('optionalJWT', async (req: FastifyRequest) => {
    const token = readBearerToken(req);
    if (!token) return;
    try {
      const claims = await verifyAccessToken(token);
      const [row] = await app.db
        .select({ id: users.id, tokenVersion: users.tokenVersion })
        .from(users)
        .where(eq(users.id, claims.sub))
        .limit(1);
      if (row && row.tokenVersion === claims.ver) {
        req.user = { id: row.id, tokenVersion: row.tokenVersion };
      }
    } catch {
      // Ignore — optional means we proceed unauthenticated
    }
  });
});

function readBearerToken(req: FastifyRequest): string | null {
  const auth = req.headers['authorization'];
  if (typeof auth !== 'string') return null;
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}
