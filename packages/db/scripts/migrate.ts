/**
 * Programmatic migration runner. Used by:
 *   - `pnpm db:migrate` from monorepo root
 *   - CI pipelines (./github/workflows/ci.yml)
 *   - Test container setup (testcontainers)
 *
 * Uses the DIRECT (non-pooled) connection because pgvector + HNSW DDL
 * doesn't play nicely with PgBouncer transaction-mode pooling.
 *
 * After the Drizzle-generated migration applies, this script ensures the
 * HNSW index on document_chunks.embedding exists with the right parameters.
 */
import { Resolver } from 'node:dns/promises';
import { config as loadEnv } from 'dotenv';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dns from 'node:dns';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../../../.env') });

const url = process.env['DATABASE_DIRECT_URL'] ?? process.env['DATABASE_URL'];
if (!url) {
  throw new Error('DATABASE_URL or DATABASE_DIRECT_URL must be set');
}

/**
 * Optional dev DNS workaround — see packages/db/src/client.ts for context.
 * When DB_DNS_SERVERS is unset (production default), this script just hands
 * the URL to postgres-js and uses the system resolver.
 */
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
  const parsed = new URL(url.replace('postgresql://', 'http://'));
  const ipv4Addrs = await dbResolver.resolve4(parsed.hostname);
  if (!ipv4Addrs[0]) throw new Error(`No A record for ${parsed.hostname}`);
  host = ipv4Addrs[0];
  servername = parsed.hostname;
}

const sql = postgres(url, {
  max: 1,
  prepare: false,
  connect_timeout: 30,
  ...(host && servername ? { host, ssl: { servername, rejectUnauthorized: true } } : {}),
});
const db = drizzle(sql);

async function main(): Promise<void> {
  console.log('▶ ensuring required extensions');
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;

  console.log('▶ running drizzle migrations');
  await migrate(db, { migrationsFolder: './migrations' });

  console.log('▶ ensuring HNSW vector index on document_chunks.embedding');
  await sql`
    CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw
      ON document_chunks
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
  `;

  // Hybrid retrieval: BM25-style lexical branch lives alongside the vector
  // branch. The generated column means Postgres maintains it on every
  // INSERT/UPDATE — ingest never has to populate it manually.
  console.log('▶ ensuring tsvector column on document_chunks.content_tsv');
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'document_chunks' AND column_name = 'content_tsv'
      ) THEN
        ALTER TABLE document_chunks
          ADD COLUMN content_tsv tsvector
          GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
      END IF;
    END
    $$
  `;
  console.log('▶ ensuring GIN index on document_chunks.content_tsv');
  await sql`
    CREATE INDEX IF NOT EXISTS chunks_content_tsv_gin
      ON document_chunks
      USING gin (content_tsv)
  `;

  console.log('✅ migrations complete');
  await sql.end({ timeout: 5 });
}

main().catch(async (err) => {
  console.error('❌ migration failed:', err);
  await sql.end({ timeout: 5 });
  process.exit(1);
});
