import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dns from 'node:dns';

// Force IPv4-first DNS — same workaround as the runtime DB client.
dns.setDefaultResultOrder('ipv4first');

// Load workspace-root .env so DATABASE_URL etc. are available in tests.
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../../../.env') });

/**
 * Prefer the DIRECT (non-pooled) URL for tests when both are available.
 *
 * Why: tests issue many fast read-after-write sequences (signup → query
 * users; create document → query documents). With Neon's pooled URL
 * (PgBouncer in transaction-pooling mode), each query may land on a
 * different backend session, and a commit issued on session A may not yet
 * be visible to a SELECT on session B if their backend socket happened to
 * predate the commit. This produces FK-violation flakes that look real
 * but are an artifact of pooled connectivity.
 *
 * Production paths use the pooled URL because they don't do the same
 * patterns (sessions are user-scoped over many seconds, not microseconds
 * apart). CI uses a local pgvector service container with a single
 * non-pooled connection — also unaffected.
 */
if (process.env['DATABASE_DIRECT_URL']) {
  process.env['DATABASE_URL'] = process.env['DATABASE_DIRECT_URL'];
}
