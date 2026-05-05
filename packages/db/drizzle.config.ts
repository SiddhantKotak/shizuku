import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load workspace-root .env (drizzle-kit runs CWD=packages/db, but secrets live at the monorepo root)
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../../.env') });

const url = process.env['DATABASE_DIRECT_URL'] ?? process.env['DATABASE_URL'];
if (!url) {
  throw new Error('DATABASE_URL or DATABASE_DIRECT_URL must be set for drizzle-kit');
}

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
  // Required so drizzle-kit doesn't try to drop the pgvector/citext extensions
  extensionsFilters: ['postgis'],
  schemaFilter: ['public'],
});
