import { and, eq } from 'drizzle-orm';
import { pets, type PetRow } from '@shizuku/db/schema';
import { type EvolutionStage, type Pet, type PetSpecies } from '@shizuku/types';
import { httpError } from '../../lib/errors.js';
import { requireUser } from '../../lib/requireUser.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

export function toPublicPet(row: PetRow): Pet {
  return {
    id: row.id,
    userId: row.userId,
    species: row.species as PetSpecies,
    name: row.name,
    level: row.level,
    xp: row.xp,
    evolutionStage: row.evolutionStage as EvolutionStage,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

const meRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/me',
    {
      preHandler: [app.verifyJWT],
      schema: {
        tags: ['pets'],
        summary: 'Get the active pet for the authenticated user',
        description: [
          "Returns the user's currently-active Pet (`{ id, species: ember|ripple|quill, name, level, xp, evolutionStage: 1|2|3, isActive: true, createdAt }`).",
          '',
          "Returns 404 `not_found` if the user hasn't completed onboarding (no active pet). The frontend translates this to `null` and routes to `/onboarding`.",
        ].join('\n'),
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      const userId = requireUser(req).id;
      const [row] = await app.db
        .select()
        .from(pets)
        .where(and(eq(pets.userId, userId), eq(pets.isActive, true)))
        .limit(1);
      if (!row) {
        // Onboarding: client should send the user to /onboarding to pick a pet.
        throw httpError.notFound('not_found', 'No active pet — pick one in onboarding');
      }
      return { data: toPublicPet(row) };
    },
  );
};

export default meRoute;
