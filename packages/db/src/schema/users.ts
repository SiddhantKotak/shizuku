import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type { AvatarConfig } from '@shizuku/types';
import { citext } from '../types.js';

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: citext('email').notNull().unique(),
    passwordHash: text('password_hash'), // null when oauth-only
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    displayName: text('display_name').notNull(),
    avatarConfig: jsonb('avatar_config').$type<AvatarConfig>().notNull(),
    ink: integer('ink').notNull().default(0),
    xp: integer('xp').notNull().default(0),
    level: integer('level').notNull().default(1),
    streakCount: integer('streak_count').notNull().default(0),
    streakLastDay: date('streak_last_day'),
    tokenVersion: integer('token_version').notNull().default(0), // bump = global revoke
    emailBounced: boolean('email_bounced').notNull().default(false),
    onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('users_email_idx').on(t.email)],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
