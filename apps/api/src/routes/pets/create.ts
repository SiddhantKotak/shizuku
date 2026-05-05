import { and, eq, isNull, sql } from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import { pets, users } from '@shizuku/db/schema';
import { createPetBodySchema } from '@shizuku/types';
import { httpError } from '../../lib/errors.js';
import { requireUser } from '../../lib/requireUser.js';
import { newId } from '../../lib/id.js';
import { toPublicPet } from './me.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const createPetRoute: FastifyPluginAsyncZod = async (app) => {
  /**
   * POST /v1/pets — create a pet for the current user.
   *
   * Slice 1 allows exactly one active pet per user. The DB-level partial
   * unique index `pets_active_per_user_uidx` is the source of truth — this
   * route's pre-check is just for a friendlier error message.
   */
  app.post(
    '/',
    {
      preHandler: [app.verifyJWT],
      schema: {
        body: createPetBodySchema,
        tags: ['pets'],
        summary: "Create the user's pet (one active per user)",
        description: [
          'Creates an active pet for the authenticated user. Slice 1 allows exactly **one** active pet per user — enforced at the DB level via partial unique index `pets_active_per_user_uidx (user_id) WHERE is_active = true`.',
          '',
          'New pets start at level 1, evolution stage 1, xp 0. Personality is fixed per species (Ember=warm/encouraging, Ripple=calm/reflective, Quill=scholarly/dry-witty).',
          '',
          '**Errors:** 409 `pet_already_active` if the user already has one.',
        ].join('\n'),
        security: [{ bearer: [] }],
      },
    },
    async (req, reply) => {
      const userId = requireUser(req).id;

      const [existing] = await app.db
        .select({ id: pets.id })
        .from(pets)
        .where(and(eq(pets.userId, userId), eq(pets.isActive, true)))
        .limit(1);
      if (existing) {
        throw httpError.conflict('pet_already_active', 'You already have an active pet');
      }

      const id = newId('pet');
      try {
        // Atomic: insert pet + flag the user as onboarded if they aren't yet.
        // Picking the pet IS the natural completion of onboarding in Slice 1
        // (avatar + species + name = the only required steps; tutorial is a
        // dismissible overlay, not a gate).
        const row = await app.db.transaction(async (tx) => {
          const [inserted] = await tx
            .insert(pets)
            .values({
              id,
              userId,
              species: req.body.species,
              name: req.body.name,
            })
            .returning();
          if (!inserted) throw new Error('insert_returned_no_row');
          await tx
            .update(users)
            .set({ onboardedAt: sql`NOW()`, updatedAt: new Date() })
            .where(and(eq(users.id, userId), isNull(users.onboardedAt)));
          return inserted;
        });
        reply.code(StatusCodes.CREATED);
        return { data: toPublicPet(row) };
      } catch (err) {
        // Race-window catch: if the partial unique index fired between our
        // pre-check and INSERT, surface the same friendly conflict.
        if (err instanceof Error && err.message.includes('pets_active_per_user_uidx')) {
          throw httpError.conflict('pet_already_active', 'You already have an active pet');
        }
        throw err;
      }
    },
  );
};

export default createPetRoute;
