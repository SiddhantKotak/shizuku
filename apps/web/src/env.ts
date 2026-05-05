import { z } from 'zod';

const schema = z.object({
  VITE_API_URL: z.string().url(),
  VITE_SENTRY_DSN: z.string().optional(),
  VITE_GOOGLE_CLIENT_ID: z.string().optional(),
  VITE_DISCORD_CLIENT_ID: z.string().optional(),
});

const parsed = schema.safeParse(import.meta.env);
if (!parsed.success) {
  console.error('Invalid client env:', parsed.error.flatten());
  throw new Error('Client env validation failed');
}
export const env = parsed.data;
