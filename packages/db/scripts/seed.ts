/**
 * Seed the quest catalog. Idempotent — uses INSERT ... ON CONFLICT DO NOTHING.
 *
 * Slice 1 ships with ~12 quest templates. Daily assignment picks 3 of these
 * deterministically per user-day in services/quests/assign.ts.
 */
import { config as loadEnv } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import dns from 'node:dns';
import { Resolver } from 'node:dns/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { quests } from '../src/schema/quests.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../../../.env') });

const url = process.env['DATABASE_DIRECT_URL'] ?? process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL or DATABASE_DIRECT_URL must be set');

// Optional dev DNS workaround — see packages/db/src/client.ts.
const devDnsServers = (process.env['DB_DNS_SERVERS'] ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

let host: string | undefined;
let servername: string | undefined;
if (devDnsServers.length > 0) {
  dns.setDefaultResultOrder('ipv4first');
  const dbResolver = new Resolver({ timeout: 5000, tries: 2 });
  dbResolver.setServers(devDnsServers);
  const u = new URL(url.replace('postgresql://', 'http://'));
  const [ipv4] = await dbResolver.resolve4(u.hostname);
  if (!ipv4) throw new Error(`No A record for ${u.hostname}`);
  host = ipv4;
  servername = u.hostname;
}

const sql = postgres(url, {
  max: 1,
  prepare: false,
  connect_timeout: 30,
  ...(host && servername ? { host, ssl: { servername, rejectUnauthorized: true } } : {}),
});
const db = drizzle(sql);

const QUEST_CATALOG = [
  // Reading-focused
  {
    code: 'read_10_pages',
    title: 'Read 10 pages',
    metric: 'pages',
    target: 10,
    inkReward: 30,
    xpReward: 50,
  },
  {
    code: 'read_20_pages',
    title: 'Read 20 pages',
    metric: 'pages',
    target: 20,
    inkReward: 60,
    xpReward: 100,
  },
  {
    code: 'read_50_pages',
    title: 'Read 50 pages',
    metric: 'pages',
    target: 50,
    inkReward: 150,
    xpReward: 250,
  },

  // Pomodoro-focused
  {
    code: 'pomodoro_1',
    title: 'Complete 1 Pomodoro session',
    metric: 'pomodoros',
    target: 1,
    inkReward: 25,
    xpReward: 40,
  },
  {
    code: 'pomodoro_2',
    title: 'Complete 2 Pomodoro sessions',
    metric: 'pomodoros',
    target: 2,
    inkReward: 60,
    xpReward: 90,
  },
  {
    code: 'pomodoro_4',
    title: 'Complete 4 Pomodoro sessions',
    metric: 'pomodoros',
    target: 4,
    inkReward: 130,
    xpReward: 200,
  },

  // Chat-focused
  {
    code: 'chat_3_pet',
    title: 'Ask your pet 3 questions',
    metric: 'chats',
    target: 3,
    inkReward: 20,
    xpReward: 30,
  },
  {
    code: 'chat_5_pet',
    title: 'Ask your pet 5 questions',
    metric: 'chats',
    target: 5,
    inkReward: 40,
    xpReward: 60,
  },
  {
    code: 'chat_10_pet',
    title: 'Ask your pet 10 questions',
    metric: 'chats',
    target: 10,
    inkReward: 80,
    xpReward: 130,
  },

  // Time-based
  {
    code: 'study_15_min',
    title: 'Study for 15 minutes',
    metric: 'minutes',
    target: 15,
    inkReward: 25,
    xpReward: 40,
  },
  {
    code: 'study_30_min',
    title: 'Study for 30 minutes',
    metric: 'minutes',
    target: 30,
    inkReward: 60,
    xpReward: 90,
  },
  {
    code: 'study_60_min',
    title: 'Study for an hour',
    metric: 'minutes',
    target: 60,
    inkReward: 130,
    xpReward: 200,
  },
] as const;

async function main(): Promise<void> {
  console.log(`▶ seeding ${QUEST_CATALOG.length} quest templates`);
  for (const q of QUEST_CATALOG) {
    await db.insert(quests).values(q).onConflictDoNothing({ target: quests.code });
  }
  console.log('✅ quest catalog seeded');
  await sql.end({ timeout: 5 });
}

main().catch(async (err) => {
  console.error('❌ seed failed:', err);
  await sql.end({ timeout: 5 });
  process.exit(1);
});
