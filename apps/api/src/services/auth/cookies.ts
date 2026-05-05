import type { FastifyReply } from 'fastify';
import { env } from '@shizuku/config';
import { REFRESH_TOKEN_TTL_SECONDS } from './refreshTokens.js';

export const REFRESH_COOKIE_NAME = 'rft';
const REFRESH_COOKIE_PATH = '/v1/auth';

const isProd = env.NODE_ENV === 'production';

/** Set the refresh-token httpOnly cookie. */
export function setRefreshCookie(reply: FastifyReply, rawToken: string): void {
  reply.setCookie(REFRESH_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  });
}

/** Clear the refresh-token cookie (logout, password reset). */
export function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}
