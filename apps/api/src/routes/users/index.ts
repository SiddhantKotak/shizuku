import avatarRoute from './avatar.js';
import meRoute from './me.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const userRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(meRoute);
  await app.register(avatarRoute);
};

export default userRoutes;
