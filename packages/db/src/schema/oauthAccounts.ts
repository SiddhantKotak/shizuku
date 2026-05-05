import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: ['google', 'discord'] }).notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('oauth_provider_account_uidx').on(t.provider, t.providerAccountId),
    index('oauth_user_idx').on(t.userId),
  ],
);

export type OAuthAccountRow = typeof oauthAccounts.$inferSelect;
export type NewOAuthAccountRow = typeof oauthAccounts.$inferInsert;
