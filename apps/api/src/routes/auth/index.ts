import discordRoute from './discord.js';
import forgotPasswordRoute from './forgotPassword.js';
import googleRoute from './google.js';
import loginRoute from './login.js';
import logoutRoute from './logout.js';
import refreshRoute from './refresh.js';
import resetPasswordRoute from './resetPassword.js';
import signupRoute from './signup.js';
import verifyEmailRoute from './verifyEmail.js';
import { emailBodyKey } from '../../plugins/rateLimit.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

/**
 * Mounts under /v1/auth.
 *
 * Per-route abuse limits (cost limits like the 100 chats/day live elsewhere):
 *  - signup:     3 per IP per hour
 *  - login:      5 per (IP + email) per 15 minutes
 *  - refresh:    30 per IP per minute
 *  - logout:     10 per (IP + email) per minute (effectively unlimited; abuse-irrelevant)
 *  - verify-email/request: 3 per user per 10 minutes
 *  - verify-email/confirm: 10 per user per minute
 *  - forgot-password: 3 per email per hour
 *  - reset-password: 10 per email per hour
 *  - google + discord initiate/callback: 30 per IP per minute (default global)
 */
const authRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(async (scope) => {
    await scope.register(signupRoute);
    await scope.register(loginRoute);
    await scope.register(refreshRoute);
    await scope.register(logoutRoute);
    await scope.register(verifyEmailRoute);
    await scope.register(forgotPasswordRoute);
    await scope.register(resetPasswordRoute);
    await scope.register(googleRoute);
    await scope.register(discordRoute);
  });
};

// Re-export the helpers so consumers (tests, internal scripts) don't have to
// dig into routes/* to know how email-keyed rate limits work.
export { emailBodyKey };
export default authRoutes;
