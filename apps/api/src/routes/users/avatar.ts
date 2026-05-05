import { eq } from 'drizzle-orm';
import { users } from '@shizuku/db/schema';
import { updateAvatarBodySchema } from '@shizuku/types';
import { httpError } from '../../lib/errors.js';
import { requireUser } from '../../lib/requireUser.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const avatarRoute: FastifyPluginAsyncZod = async (app) => {
  app.patch(
    '/me/avatar',
    {
      preHandler: [app.verifyJWT],
      schema: {
        body: updateAvatarBodySchema,
        tags: ['users'],
        summary: 'Update avatar configuration',
        description:
          "Stores `{ presetId: 1..6, hueShift: 0..360, satShift: -100..100 }` as the user's `avatar_config` jsonb. Onboarding writes this once; the user can edit later in Settings.",
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      const userId = requireUser(req).id;
      const [row] = await app.db
        .update(users)
        .set({ avatarConfig: req.body, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({ avatarConfig: users.avatarConfig });
      if (!row) throw httpError.notFound();
      return { data: row.avatarConfig };
    },
  );
};

export default avatarRoute;
