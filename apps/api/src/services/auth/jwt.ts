import { jwtVerify, SignJWT, errors as joseErrors } from 'jose';
import { randomUUID } from 'node:crypto';
import { env } from '@shizuku/config';
import { httpError } from '../../lib/errors.js';

const ALG = 'HS256';
const ISSUER = 'shizuku';
const AUDIENCE = 'shizuku-web';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes

export interface AccessClaims {
  sub: string; // userId
  ver: number; // user.tokenVersion — bump invalidates all access tokens globally
  scope: 'access';
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
}

let secretBytes: Uint8Array | null = null;
function getSecret(): Uint8Array {
  if (!secretBytes) secretBytes = new TextEncoder().encode(env.JWT_SECRET);
  return secretBytes;
}

export async function signAccessToken(userId: string, tokenVersion: number): Promise<string> {
  return new SignJWT({ scope: 'access', ver: tokenVersion })
    .setProtectedHeader({ alg: ALG })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: [ALG],
    });
    if (payload['scope'] !== 'access') {
      throw httpError.unauthorized('invalid_token', 'Token scope mismatch');
    }
    return payload as unknown as AccessClaims;
  } catch (e) {
    if (e instanceof joseErrors.JWTExpired) {
      throw httpError.unauthorized('token_expired', 'Access token expired');
    }
    if (e instanceof joseErrors.JOSEError) {
      throw httpError.unauthorized('invalid_token', 'Invalid access token');
    }
    throw e;
  }
}
