import { and, eq } from 'drizzle-orm';
import { pets } from '@shizuku/db/schema';
import { type EvolutionStage } from '@shizuku/types';
import { httpError } from '../../lib/errors.js';
import { requireUser } from '../../lib/requireUser.js';
import { canEvolve, eligibleEvolutionStageForLevel } from '../../services/pets/engine.js';
import { toPublicPet } from './me.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const evolvePetRoute: FastifyPluginAsyncZod = async (app) => {
  /**
   * POST /v1/pets/me/evolve
   *  - 200 with evolved pet if eligible
   *  - 409 pet_not_evolvable if level too low (or already at final stage)
   *  - 404 if no active pet
   */
  app.post(
    '/me/evolve',
    {
      preHandler: [app.verifyJWT],
      schema: {
        tags: ['pets'],
        summary: 'Evolve the pet to its next stage',
        description: [
          'Bumps `evolutionStage` to whatever the current `level` qualifies for. Stage thresholds: L8 → stage 2, L20 → stage 3.',
          '',
          'Atomic via FOR UPDATE row lock — concurrent evolve requests are serialized.',
          '',
          '**Errors:**',
          '- 404 `not_found` — user has no active pet',
          "- 409 `pet_not_evolvable` — pet's level is below the next-stage threshold (or already at stage 3)",
        ].join('\n'),
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      const userId = requireUser(req).id;
      const result = await app.db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(pets)
          .where(and(eq(pets.userId, userId), eq(pets.isActive, true)))
          .for('update')
          .limit(1);
        if (!row) return { kind: 'not_found' as const };

        if (
          !canEvolve({
            level: row.level,
            evolutionStage: row.evolutionStage as EvolutionStage,
          })
        ) {
          return { kind: 'not_eligible' as const, level: row.level, stage: row.evolutionStage };
        }
        const nextStage = eligibleEvolutionStageForLevel(row.level);
        const [updated] = await tx
          .update(pets)
          .set({ evolutionStage: nextStage })
          .where(eq(pets.id, row.id))
          .returning();
        if (!updated) throw new Error('pet_evolve_returning_no_row');
        return { kind: 'ok' as const, pet: updated };
      });

      if (result.kind === 'not_found') {
        throw httpError.notFound('not_found', 'No active pet to evolve');
      }
      if (result.kind === 'not_eligible') {
        throw httpError.conflict(
          'pet_not_evolvable',
          `Pet must reach a higher level to evolve from stage ${result.stage}`,
          { currentStage: result.stage, currentLevel: result.level },
        );
      }
      return { data: toPublicPet(result.pet) };
    },
  );
};

export default evolvePetRoute;
