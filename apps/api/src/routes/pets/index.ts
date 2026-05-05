import createPetRoute from './create.js';
import evolvePetRoute from './evolve.js';
import meRoute from './me.js';
import updatePetRoute from './update.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const petRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(meRoute);
  await app.register(createPetRoute);
  await app.register(updatePetRoute);
  await app.register(evolvePetRoute);
};

export default petRoutes;
