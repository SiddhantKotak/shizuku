import { apiFetch } from './client';

// -------- Pomodoro --------

export interface StartPomodoroResponse {
  id: string;
}

export interface CompletePomodoroResponse {
  id: string;
  minutesAwarded: number;
  xpAwarded: number;
  petLevel: number | null;
  leveledUp: boolean;
}

export interface PomodoroSessionRow {
  id: string;
  documentId: string | null;
  startedAt: string;
  completedAt: string | null;
  cycleCount: number;
  status: 'active' | 'completed' | 'abandoned';
}

export async function startPomodoro(documentId?: string): Promise<StartPomodoroResponse> {
  return apiFetch<StartPomodoroResponse>('/v1/pomodoro/start', {
    method: 'POST',
    body: documentId ? { documentId } : {},
  });
}

export async function completePomodoro(args: {
  id: string;
  cycleCount: number;
  minutesElapsed: number;
}): Promise<CompletePomodoroResponse> {
  return apiFetch<CompletePomodoroResponse>(`/v1/pomodoro/${args.id}/complete`, {
    method: 'POST',
    body: { cycleCount: args.cycleCount, minutesElapsed: args.minutesElapsed },
  });
}

export async function listPomodoros(
  range: 'today' | 'week' | 'all' = 'week',
): Promise<PomodoroSessionRow[]> {
  return apiFetch<PomodoroSessionRow[]>(`/v1/pomodoro?range=${range}`);
}

// -------- Quests --------

export interface QuestSummary {
  userQuestId: string;
  questCode: string;
  title: string;
  metric: 'pages' | 'pomodoros' | 'chats' | 'minutes';
  target: number;
  inkReward: number;
  xpReward: number;
  progress: number;
  status: 'active' | 'completed' | 'expired';
  completedAt: string | null;
  claimedAt: string | null;
  assignedDate: string;
}

export interface ClaimQuestResult {
  inkAwarded: number;
  xpAwarded: number;
}

export async function getTodayQuests(): Promise<QuestSummary[]> {
  return apiFetch<QuestSummary[]>('/v1/quests/today');
}

export async function claimQuest(userQuestId: string): Promise<ClaimQuestResult> {
  return apiFetch<ClaimQuestResult>(`/v1/quests/${userQuestId}/claim`, { method: 'POST' });
}

// -------- Stats / streak --------

export interface StatsRow {
  day: string;
  minutes: number;
  pages: number;
  chats: number;
  pomodoros: number;
}

export async function getStats(range: 'today' | 'week' | 'all'): Promise<StatsRow[]> {
  return apiFetch<StatsRow[]>(`/v1/stats?range=${range}`);
}

export interface StreakInfo {
  count: number;
  lastDay: string | null;
}

export async function getStreak(): Promise<StreakInfo> {
  return apiFetch<StreakInfo>('/v1/streak');
}
