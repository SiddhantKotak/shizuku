/**
 * Single source of truth for auth form validation: re-export the canonical
 * Zod schemas from `@shizuku/types` (which the API server also imports), plus
 * client-only refinements the API doesn't need to know about.
 *
 * Forms in `components/auth/*` import schemas from THIS file (not directly
 * from @shizuku/types) so we have one place to add UX-only fields like
 * password confirmation.
 */
import { z } from 'zod';
import {
  forgotPasswordBodySchema,
  loginBodySchema,
  resetPasswordBodySchema,
  signupBodySchema,
  verifyEmailConfirmBodySchema,
} from '@shizuku/types';

export {
  forgotPasswordBodySchema,
  loginBodySchema,
  resetPasswordBodySchema,
  signupBodySchema,
  verifyEmailConfirmBodySchema,
};

export type {
  ForgotPasswordBody,
  LoginBody,
  ResetPasswordBody,
  SignupBody,
  VerifyEmailConfirmBody,
} from '@shizuku/types';

/**
 * Signup form adds a confirmPassword field that's stripped before the API call.
 * The `.refine` runs after the `.extend` so the password-match check only
 * fires when both fields are populated AND match.
 */
export const signupFormSchema = signupBodySchema
  .extend({
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords must match',
    path: ['confirmPassword'],
  });
export type SignupFormValues = z.infer<typeof signupFormSchema>;

/** Reset-password form adds a confirmPassword field, same pattern. */
export const resetPasswordFormSchema = resetPasswordBodySchema
  .extend({
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords must match',
    path: ['confirmPassword'],
  });
export type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>;
