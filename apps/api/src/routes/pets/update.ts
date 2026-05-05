import { and, eq } from 'drizzle-orm';
import { pets } from '@shizuku/db/schema';
import { updatePetBodySchema } from '@shizuku/types';
import { httpError } from '../../lib/errors.js';
import { requireUser } from '../../lib/requireUser.js';
import { toPublicPet } from './me.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const updatePetRoute: FastifyPluginAsyncZod = async (app) => {
  app.patch(
    '/me',
    {
      preHandler: [app.verifyJWT],
      schema: {
        body: updatePetBodySchema,
        tags: ['pets'],
        summary: 'Rename the active pet',
        description:
          'Slice 1 supports renaming only (3-16 chars, unicode + space + apostrophe + hyphen). Species cannot be changed once chosen — pets are species-locked at creation.',
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      const userId = requireUser(req).id;
      const updates: { name?: string } = {};
      if (req.body.name !== undefined) updates.name = req.body.name;

      const [row] = await app.db
        .update(pets)
        .set(updates)
        .where(and(eq(pets.userId, userId), eq(pets.isActive, true)))
        .returning();
      if (!row) throw httpError.notFound('not_found', 'No active pet to update');
      return { data: toPublicPet(row) };
    },
  );
};

export default updatePetRoute;
