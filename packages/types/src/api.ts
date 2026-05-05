import { z } from 'zod';
import {
  avatarConfigSchema,
  highlightRangeSchema,
  HIGHLIGHT_COLORS,
  PET_SPECIES,
} from './domain.js';

// ============================================================================
// Auth — request/response DTOs (Zod schemas; types inferred)
// ============================================================================
export const signupBodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(10).max(200),
  displayName: z.string().min(1).max(40),
});
export type SignupBody = z.infer<typeof signupBodySchema>;

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

// 6-digit numeric OTP — the validation pattern is reused by every OTP route.
export const otpCodeSchema = z.string().regex(/^[0-9]{6}$/, 'Code must be exactly 6 digits');

export const forgotPasswordBodySchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;

export const resetPasswordBodySchema = z.object({
  email: z.string().email(),
  code: otpCodeSchema,
  password: z.string().min(10).max(200),
});
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;

export const verifyEmailConfirmBodySchema = z.object({
  code: otpCodeSchema,
});
export type VerifyEmailConfirmBody = z.infer<typeof verifyEmailConfirmBodySchema>;

export const authSessionResponseSchema = z.object({
  accessToken: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    displayName: z.string(),
  }),
});
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

// ============================================================================
// User
// ============================================================================
export const updateUserBodySchema = z
  .object({
    displayName: z.string().min(1).max(40).optional(),
  })
  .strict();
export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;

export const updateAvatarBodySchema = avatarConfigSchema;
export type UpdateAvatarBody = z.infer<typeof updateAvatarBodySchema>;

export const deleteUserBodySchema = z.object({
  password: z.string().optional(),
});
export type DeleteUserBody = z.infer<typeof deleteUserBodySchema>;

// ============================================================================
// Pet
// ============================================================================
export const createPetBodySchema = z.object({
  species: z.enum(PET_SPECIES),
  name: z
    .string()
    .min(3)
    .max(16)
    .regex(/^[\p{L}\p{N} '-]+$/u, 'Letters, numbers, spaces, apostrophes, hyphens only'),
});
export type CreatePetBody = z.infer<typeof createPetBodySchema>;

export const updatePetBodySchema = z
  .object({
    name: z.string().min(3).max(16).optional(),
  })
  .strict();
export type UpdatePetBody = z.infer<typeof updatePetBodySchema>;

// ============================================================================
// Documents
// ============================================================================

/** `:id` path param shared by every per-document route. */
export const documentIdParamSchema = z.object({
  id: z.string().regex(/^doc_/, 'Not a document id'),
});
export type DocumentIdParam = z.infer<typeof documentIdParamSchema>;

/** GET /v1/documents — cursor pagination. Cursor is the previous page's
 *  trailing `uploadedAt` timestamp, kept opaque to the client. */
export const listDocumentsQuerySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

/** Returned by GET /v1/documents/:id/signed-url. The expiry is informational —
 *  the client should not rely on its own clock; it should fetch the URL just
 *  before opening the PDF. */
export const signedUrlResponseSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string().datetime(),
});
export type SignedUrlResponse = z.infer<typeof signedUrlResponseSchema>;

export const documentChatBodySchema = z.object({
  message: z.string().min(1).max(2000),
});
export type DocumentChatBody = z.infer<typeof documentChatBodySchema>;

export const updateReadingProgressBodySchema = z.object({
  currentPage: z.number().int().positive(),
});
export type UpdateReadingProgressBody = z.infer<typeof updateReadingProgressBodySchema>;

export const createHighlightBodySchema = z.object({
  page: z.number().int().positive(),
  range: highlightRangeSchema,
  color: z.enum(HIGHLIGHT_COLORS),
  note: z.string().max(500).optional(),
});
export type CreateHighlightBody = z.infer<typeof createHighlightBodySchema>;

export const updateHighlightBodySchema = z
  .object({
    color: z.enum(HIGHLIGHT_COLORS).optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .strict();
export type UpdateHighlightBody = z.infer<typeof updateHighlightBodySchema>;

export const createBookmarkBodySchema = z.object({
  page: z.number().int().positive(),
  label: z.string().max(80).optional(),
});
export type CreateBookmarkBody = z.infer<typeof createBookmarkBodySchema>;

// ============================================================================
// Pomodoro
// ============================================================================
export const startPomodoroBodySchema = z.object({
  documentId: z.string().optional(),
});
export type StartPomodoroBody = z.infer<typeof startPomodoroBodySchema>;

export const pomodoroIdParamSchema = z.object({
  id: z.string().regex(/^pmd_/, 'Not a pomodoro id'),
});
export type PomodoroIdParam = z.infer<typeof pomodoroIdParamSchema>;

export const completePomodoroBodySchema = z.object({
  /** Final cycle count (defaults to 1 — focus block + break). */
  cycleCount: z.number().int().min(1).max(10).default(1),
  /** Minutes actually elapsed; trusted from client but capped server-side. */
  minutesElapsed: z.number().int().min(1).max(180),
});
export type CompletePomodoroBody = z.infer<typeof completePomodoroBodySchema>;

export const pomodoroListQuerySchema = z.object({
  range: z.enum(['today', 'week', 'all']).default('week'),
});
export type PomodoroListQuery = z.infer<typeof pomodoroListQuerySchema>;

// ============================================================================
// Quests
// ============================================================================
export const userQuestIdParamSchema = z.object({
  id: z.string().regex(/^uq_/, 'Not a user-quest id'),
});
export type UserQuestIdParam = z.infer<typeof userQuestIdParamSchema>;

// ============================================================================
// Stats
// ============================================================================
export const statsRangeSchema = z.enum(['today', 'week', 'all']);
export type StatsRange = z.infer<typeof statsRangeSchema>;

export const statsQuerySchema = z.object({
  range: statsRangeSchema.default('today'),
});
export type StatsQuery = z.infer<typeof statsQuerySchema>;

// ============================================================================
// Generic envelopes
// ============================================================================
export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
