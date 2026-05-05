import { sql } from 'drizzle-orm';
import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const pets = pgTable(
  'pets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    species: text('species', { enum: ['ember', 'ripple', 'quill'] }).notNull(),
    name: text('name').notNull(),
    level: integer('level').notNull().default(1),
    xp: integer('xp').notNull().default(0),
    evolutionStage: integer('evolution_stage').notNull().default(1), // 1..3
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Partial unique index: enforce exactly one active pet per user
    uniqueIndex('pets_active_per_user_uidx')
      .on(t.userId)
      .where(sql`${t.isActive} = true`),
  ],
);

export type PetRow = typeof pets.$inferSelect;
export type NewPetRow = typeof pets.$inferInsert;
