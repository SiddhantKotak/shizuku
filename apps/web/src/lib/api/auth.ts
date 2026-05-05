import type {
  AuthSessionResponse,
  ForgotPasswordBody,
  LoginBody,
  ResetPasswordBody,
  SignupBody,
  VerifyEmailConfirmBody,
} from '@shizuku/types';
import { apiFetch } from './client';

/**
 * Typed POST helpers for every /v1/auth/* endpoint.
 *
 * Session-establishing routes (signup, login, logout, forgot-password,
 * reset-password) pass `skipRefresh: true` so a stale 401 doesn't trigger
 * the refresh-on-401 interceptor — that would race with the new session
 * we're about to establish.
 *
 * Authed routes (verify-email/*) leave the default refresh-on-401 behaviour,
 * so a transient access-token expiry inside the OTP form retries cleanly.
 */

export function postSignup(body: SignupBody): Promise<AuthSessionResponse> {
  return apiFetch<AuthSessionResponse>('/v1/auth/signup', {
    method: 'POST',
    body,
    skipRefresh: true,
  });
}

export function postLogin(body: LoginBody): Promise<AuthSessionResponse> {
  return apiFetch<AuthSessionResponse>('/v1/auth/login', {
    method: 'POST',
    body,
    skipRefresh: true,
  });
}

export function postLogout(): Promise<void> {
  return apiFetch<void>('/v1/auth/logout', { method: 'POST', skipRefresh: true });
}

export function postForgotPassword(body: ForgotPasswordBody): Promise<void> {
  return apiFetch<void>('/v1/auth/forgot-password', {
    method: 'POST',
    body,
    skipRefresh: true,
  });
}

export function postResetPassword(body: ResetPasswordBody): Promise<void> {
  return apiFetch<void>('/v1/auth/reset-password', {
    method: 'POST',
    body,
    skipRefresh: true,
  });
}

export function postVerifyEmailRequest(): Promise<void> {
  return apiFetch<void>('/v1/auth/verify-email/request', { method: 'POST' });
}

export function postVerifyEmailConfirm(body: VerifyEmailConfirmBody): Promise<void> {
  return apiFetch<void>('/v1/auth/verify-email/confirm', { method: 'POST', body });
}
