import { eq } from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import { users } from '@shizuku/db/schema';
import { deleteUserBodySchema, updateUserBodySchema, type User } from '@shizuku/types';
import { httpError } from '../../lib/errors.js';
import { requireUser } from '../../lib/requireUser.js';
import { revokeAllUserRefreshTokens } from '../../services/auth/refreshTokens.js';
import { verifyPassword } from '../../services/auth/password.js';
import type { UserRow } from '@shizuku/db/schema';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

/** Map a DB users row to the public-facing User shape (ISO timestamps). */
function toPublicUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    avatarConfig: row.avatarConfig,
    ink: row.ink,
    xp: row.xp,
    level: row.level,
    streakCount: row.streakCount,
    streakLastDay: row.streakLastDay ?? null,
    emailVerifiedAt: row.emailVerifiedAt?.toISOString() ?? null,
    onboardedAt: row.onboardedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const meRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/me',
    {
      preHandler: [app.verifyJWT],
      schema: {
        tags: ['users'],
        summary: 'Get the authenticated user',
        description:
          'Returns the full User profile (id, email, displayName, avatarConfig, ink, xp, level, streakCount, emailVerifiedAt, onboardedAt, createdAt). The frontend caches this under `queryKeys.me()`.',
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      const userId = requireUser(req).id;
      const [row] = await app.db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!row) throw httpError.notFound();
      return { data: toPublicUser(row) };
    },
  );

  app.patch(
    '/me',
    {
      preHandler: [app.verifyJWT],
      schema: {
        body: updateUserBodySchema,
        tags: ['users'],
        summary: 'Update the authenticated user',
        description:
          'Currently supports updating `displayName` only. Strict body validation rejects unknown fields. Email changes are gated behind a separate flow (not yet implemented in Slice 1).',
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      const userId = requireUser(req).id;
      const updates: Partial<UserRow> = { updatedAt: new Date() };
      if (req.body.displayName !== undefined) updates.displayName = req.body.displayName;

      const [row] = await app.db.update(users).set(updates).where(eq(users.id, userId)).returning();
      if (!row) throw httpError.notFound();
      return { data: toPublicUser(row) };
    },
  );

  app.delete(
    '/me',
    {
      preHandler: [app.verifyJWT],
      schema: {
        body: deleteUserBodySchema,
        tags: ['users'],
        summary: 'Delete the authenticated user (GDPR)',
        description: [
          'Hard-deletes the user row + cascades to oauth_accounts, refresh_tokens, pets, documents, document_chunks, highlights, bookmarks, pomodoro_sessions, chat_messages, daily_stats, cost_counters, user_quests, password_reset_tokens, email_verifications.',
          '',
          'Password-having accounts MUST send `{ password }` to confirm. OAuth-only accounts (no `password_hash`) skip the check (the cookie alone authorises).',
          '',
          '**Errors:** 401 `invalid_credentials` if password missing/wrong on a password account.',
        ].join('\n'),
        security: [{ bearer: [] }],
      },
    },
    async (req, reply) => {
      const userId = requireUser(req).id;
      // If the user has a password, require it to confirm deletion. OAuth-only
      // users (no passwordHash) skip the check — they'd need to disconnect the
      // OAuth provider separately, which is a Slice 2 feature.
      const [row] = await app.db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!row) throw httpError.notFound();

      if (row.passwordHash) {
        if (!req.body.password) {
          throw httpError.unauthorized(
            'invalid_credentials',
            'Password required to delete account',
          );
        }
        const ok = await verifyPassword(row.passwordHash, req.body.password);
        if (!ok) throw httpError.unauthorized('invalid_credentials', 'Invalid password');
      }

      // Revoke sessions BEFORE deleting — the cascade kills refresh_tokens
      // anyway, but explicit revoke runs even if cascade is somehow skipped.
      await revokeAllUserRefreshTokens(app.db, userId, 'admin');
      await app.db.delete(users).where(eq(users.id, userId));
      reply.code(StatusCodes.NO_CONTENT).send();
    },
  );
};

export default meRoute;
