import bookmarksRoute from './bookmarks.js';
import chatRoutes from './chat.js';
import deleteRoute from './delete.js';
import getRoute from './get.js';
import highlightsRoute from './highlights.js';
import listRoute from './list.js';
import readingProgressRoute from './readingProgress.js';
import refineRoute from './refine.js';
import signedUrlRoute from './signedUrl.js';
import uploadRoute from './upload.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const documentRoutes: FastifyPluginAsyncZod = async (app) => {
  // Order matters when paths collide; here all paths are distinct so it's
  // mostly cosmetic. List before get so /docs UI groups the index alongside
  // the create endpoint.
  await app.register(listRoute);
  await app.register(uploadRoute);
  await app.register(getRoute);
  await app.register(deleteRoute);
  await app.register(signedUrlRoute);
  await app.register(chatRoutes);
  await app.register(refineRoute);
  await app.register(highlightsRoute);
  await app.register(bookmarksRoute);
  await app.register(readingProgressRoute);
};

export default documentRoutes;
