import dns from 'node:dns';
import { Resolver } from 'node:dns/promises';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@shizuku/config';
import * as schema from './schema/index.js';

/**
 * Optional dev-only DNS workaround. When `DB_DNS_SERVERS` is set in env, we:
 *   - Use a custom Resolver pinned to those servers (bypasses systemd-resolved
 *     and corporate DNS that may REFUSE / fail certain hostnames).
 *   - Force IPv4-first lookup on Node's default resolver (sidesteps WSL2 /
 *     restrictive-egress NATs where AAAA resolves but IPv6 routing is dead).
 *   - Inject the resolved IPv4 directly into the postgres-js host option,
 *     keeping the original hostname as TLS SNI servername.
 *
 * When `DB_DNS_SERVERS` is unset (production default), this entire block is
 * a no-op — postgres-js uses the system resolver normally. That keeps prod
 * compatible with private DNS (PrivateLink, internal CoreDNS, Tailscale).
 */
const DEV_DNS_SERVERS = parseDnsServers(env.DB_DNS_SERVERS);
const dbResolver = DEV_DNS_SERVERS.length > 0 ? new Resolver({ timeout: 5000, tries: 2 }) : null;
if (dbResolver) {
  dbResolver.setServers(DEV_DNS_SERVERS);
  dns.setDefaultResultOrder('ipv4first');
}

function parseDnsServers(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export type Db = PostgresJsDatabase<typeof schema>;

export interface CreateDbOptions {
  /** Connection string. Pooled DSN for runtime, direct for migrations. */
  url: string;
  /** Max connections in the postgres-js pool. Default 10. */
  max?: number;
  /** Idle connection timeout in seconds. Default 20. */
  idleTimeout?: number;
  /** Connection timeout in seconds. Default 10. */
  connectTimeout?: number;
  /** Enable SQL logging at the postgres-js level. Default false. */
  logger?: boolean;
}

/**
 * Build a Drizzle client backed by a postgres-js pool.
 *
 * In default (production) mode this just hands the connection string to
 * postgres-js and lets the system resolver do its job. When the dev-only
 * `DB_DNS_SERVERS` env override is active, we pre-resolve the hostname via
 * the pinned resolver and pass the IPv4 + SNI hostname to postgres-js — see
 * the DEV_DNS_SERVERS block at the top of this file for context.
 *
 * Caller is responsible for closing the pool with `close()` on shutdown.
 */
export async function createDb(
  opts: CreateDbOptions,
): Promise<{ db: Db; close: () => Promise<void> }> {
  let host: string | undefined;
  let servername: string | undefined;
  if (dbResolver) {
    const u = new URL(opts.url.replace(/^postgresql:\/\//, 'http://'));
    try {
      const v4 = await dbResolver.resolve4(u.hostname);
      host = v4[0];
      servername = u.hostname;
    } catch {
      // Fall through — let postgres-js do its own lookup via system resolver.
    }
  }

  const sql = postgres(opts.url, {
    max: opts.max ?? 10,
    idle_timeout: opts.idleTimeout ?? 20,
    connect_timeout: opts.connectTimeout ?? 10,
    prepare: false, // pooled DSNs (Neon -pooler) require this off
    ...(host && servername ? { host, ssl: { servername, rejectUnauthorized: true } } : {}),
  });
  const db = drizzle(sql, { schema, logger: opts.logger ?? false });
  return {
    db,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}
