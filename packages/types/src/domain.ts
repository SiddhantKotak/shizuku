import { z } from 'zod';

// ============================================================================
// Identifiers (prefixed nanoid; opaque-but-readable)
// ============================================================================
export const idSchema = z.string().min(8).max(40);

export const PET_SPECIES = ['ember', 'ripple', 'quill'] as const;
export type PetSpecies = (typeof PET_SPECIES)[number];

export const EVOLUTION_STAGES = [1, 2, 3] as const;
export type EvolutionStage = (typeof EVOLUTION_STAGES)[number];

export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink'] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export const OAUTH_PROVIDERS = ['google', 'discord'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export const INDEX_STATUSES = ['pending', 'indexing', 'ready', 'failed'] as const;
export type IndexStatus = (typeof INDEX_STATUSES)[number];

export const POMODORO_STATUSES = ['active', 'completed', 'abandoned'] as const;
export type PomodoroStatus = (typeof POMODORO_STATUSES)[number];

export const QUEST_METRICS = ['pages', 'pomodoros', 'chats', 'minutes'] as const;
export type QuestMetric = (typeof QUEST_METRICS)[number];

export const QUEST_STATUSES = ['active', 'completed', 'expired'] as const;
export type QuestStatus = (typeof QUEST_STATUSES)[number];

export const CHAT_ROLES = ['user', 'assistant'] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

// ============================================================================
// Avatar configuration (stored as jsonb on users)
// ============================================================================
export const avatarConfigSchema = z.object({
  presetId: z.number().int().min(1).max(6),
  hueShift: z.number().min(0).max(360).default(0),
  satShift: z.number().min(-100).max(100).default(0),
});
export type AvatarConfig = z.infer<typeof avatarConfigSchema>;

// ============================================================================
// Highlight range (stored as jsonb on highlights)
// ============================================================================
export const highlightRangeSchema = z.object({
  startNodeIndex: z.number().int().nonnegative(),
  startOffset: z.number().int().nonnegative(),
  endNodeIndex: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  quote: z.string().max(2000),
});
export type HighlightRange = z.infer<typeof highlightRangeSchema>;

// ============================================================================
// Pet flavor (frontend-safe; voice/system-prompt lives server-side only)
// Keep this list in sync with `apps/api/src/services/pets/personalities.ts` —
// the server owns the system prompt half, this owns the user-visible half.
// ============================================================================
export interface PetFlavor {
  species: PetSpecies;
  /** Display name for the species in the picker, e.g. "Ember". */
  displayName: string;
  /** One-line description shown on the species card during onboarding. */
  flavor: string;
  /** Stage names — Stage1 / Stage2 / Stage3. Surfaced in the evolution preview. */
  stageNames: readonly [string, string, string];
}

export const PET_FLAVORS: Record<PetSpecies, PetFlavor> = {
  ember: {
    species: 'ember',
    displayName: 'Ember',
    flavor: 'A bold fire fox who learns alongside you with bright curiosity.',
    stageNames: ['Sprout', 'Spark', 'Inferno'],
  },
  ripple: {
    species: 'ripple',
    displayName: 'Ripple',
    flavor: 'A calm river otter who reflects before answering.',
    stageNames: ['Drop', 'Stream', 'Tide'],
  },
  quill: {
    species: 'quill',
    displayName: 'Quill',
    flavor: 'A scholarly forest owl who structures everything precisely.',
    stageNames: ['Page', 'Chapter', 'Tome'],
  },
};

// ============================================================================
// Citation (returned by chat SSE 'done' event)
// ============================================================================
export const citationSchema = z.object({
  chunkId: z.string(),
  page: z.number().int().positive(),
});
export type Citation = z.infer<typeof citationSchema>;

// ============================================================================
// LLM-as-judge — post-stream quality eval (P10.5)
// Runs asynchronously after gpt-4o finishes streaming. The four-axis score
// (0-2 each, total 0-8) is persisted on chat_messages so the SPA can render
// a [Refine] affordance when verdict='needs_refinement'.
// ============================================================================
export const judgeScoresSchema = z.object({
  citesPages: z.number().int().min(0).max(2),
  inCharacter: z.number().int().min(0).max(2),
  grounded: z.number().int().min(0).max(2),
  helpful: z.number().int().min(0).max(2),
});
export type JudgeScores = z.infer<typeof judgeScoresSchema>;

export const judgeVerdictSchema = z.enum(['approved', 'needs_refinement']);
export type JudgeVerdict = z.infer<typeof judgeVerdictSchema>;

export const judgeReportSchema = z.object({
  scores: judgeScoresSchema,
  total: z.number().int().min(0).max(8),
  issues: z.array(z.string().max(280)).max(10),
  verdict: judgeVerdictSchema,
});
export type JudgeReport = z.infer<typeof judgeReportSchema>;

// ============================================================================
// Public domain types (server → client view models)
// ============================================================================
export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarConfig: AvatarConfig;
  ink: number;
  xp: number;
  level: number;
  streakCount: number;
  streakLastDay: string | null; // ISO date YYYY-MM-DD
  emailVerifiedAt: string | null; // ISO timestamp
  onboardedAt: string | null;
  createdAt: string;
}

export interface Pet {
  id: string;
  userId: string;
  species: PetSpecies;
  name: string;
  level: number;
  xp: number;
  evolutionStage: EvolutionStage;
  isActive: boolean;
  createdAt: string;
}

export interface DocumentMeta {
  id: string;
  userId: string;
  title: string;
  filename: string;
  pageCount: number | null;
  byteSize: number;
  isPrivate: boolean;
  indexStatus: IndexStatus;
  indexError: string | null;
  chunkCount: number;
  uploadedAt: string;
  indexedAt: string | null;
}

export interface Highlight {
  id: string;
  documentId: string;
  page: number;
  range: HighlightRange;
  color: HighlightColor;
  note: string | null;
  createdAt: string;
}

export interface Bookmark {
  id: string;
  documentId: string;
  page: number;
  label: string | null;
  createdAt: string;
}

export interface ReadingProgress {
  documentId: string;
  currentPage: number;
  lastReadAt: string;
}

export interface ChatMessage {
  id: string;
  documentId: string;
  role: ChatRole;
  content: string;
  citations: Citation[] | null;
  /**
   * Set when this message is a refine of an earlier assistant message
   * (i.e. the judge flagged the original and the user clicked Refine).
   */
  parentMessageId: string | null;
  /** Null until the post-stream judge has finished evaluating. */
  judgeVerdict: JudgeVerdict | null;
  judgeScores: JudgeScores | null;
  judgeIssues: string[] | null;
  createdAt: string;
}

export interface PomodoroSession {
  id: string;
  documentId: string | null;
  startedAt: string;
  completedAt: string | null;
  cycleCount: number;
  status: PomodoroStatus;
}

export interface Quest {
  code: string;
  title: string;
  metric: QuestMetric;
  target: number;
  inkReward: number;
  xpReward: number;
}

export interface UserQuest {
  id: string;
  questCode: string;
  assignedDate: string; // ISO YYYY-MM-DD
  progress: number;
  status: QuestStatus;
  completedAt: string | null;
  // Joined view:
  quest?: Quest;
}

export interface DailyStats {
  day: string; // ISO YYYY-MM-DD
  minutes: number;
  pages: number;
  chats: number;
  pomodoros: number;
}

export interface UsageSnapshot {
  chats: { used: number; limit: number; resetAt: string };
  pdfs: { used: number; limit: number };
  pdfMaxBytes: number;
}

export interface StreakInfo {
  count: number;
  lastDay: string | null;
}
