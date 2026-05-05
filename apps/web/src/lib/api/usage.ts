import { apiFetch } from './client';

export interface UsageSnapshot {
  chats: { used: number; limit: number; resetAt: string };
  pdfs: { used: number; limit: number };
}

export async function getUsage(): Promise<UsageSnapshot> {
  return apiFetch<UsageSnapshot>('/v1/usage');
}
