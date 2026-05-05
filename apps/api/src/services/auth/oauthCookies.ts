import { env } from '@shizuku/config';
import type { FastifyReply } from 'fastify';
import type { OAuthProvider } from '@shizuku/types';

/**
 * Short-lived state + PKCE cookies set during the OAuth redirect dance.
 * Scoped to the provider's callback path so they don't leak to other routes.
 *
 * 10-minute TTL is plenty for the round trip; longer would let a leaked cookie
 * stay useful for state-replay attacks. Scoping to the callback path means the
 * SPA never sees these cookies and can't accidentally read or expose them.
 */
const OAUTH_COOKIE_TTL_SECONDS = 10 * 60;

const isProd = env.NODE_ENV === 'production';

const stateName = (provider: OAuthProvider): string => `oauth_${provider}_state`;
const pkceName = (provider: OAuthProvider): string => `oauth_${provider}_pkce`;
const callbackPath = (provider: OAuthProvider): string => `/v1/auth/${provider}/callback`;

export function setOauthFlowCookies(
  reply: FastifyReply,
  provider: OAuthProvider,
  state: string,
  codeVerifier: string,
): void {
  const opts = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const, // 'strict' would block the redirect-from-Google → cookie scenario
    path: callbackPath(provider),
    maxAge: OAUTH_COOKIE_TTL_SECONDS,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
  reply.setCookie(stateName(provider), state, opts);
  reply.setCookie(pkceName(provider), codeVerifier, opts);
}

export interface OauthFlowCookies {
  state: string | undefined;
  codeVerifier: string | undefined;
}

export function readOauthFlowCookies(
  cookies: Record<string, string | undefined>,
  provider: OAuthProvider,
): OauthFlowCookies {
  return {
    state: cookies[stateName(provider)],
    codeVerifier: cookies[pkceName(provider)],
  };
}

export function clearOauthFlowCookies(reply: FastifyReply, provider: OAuthProvider): void {
  reply.clearCookie(stateName(provider), { path: callbackPath(provider) });
  reply.clearCookie(pkceName(provider), { path: callbackPath(provider) });
}
