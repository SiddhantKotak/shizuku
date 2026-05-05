import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type { Citation, JudgeScores } from '@shizuku/types';
import { documents } from './documents.js';
import { users } from './users.js';

/**
 * Per-(user, document) chat history.
 *
 * Judge columns (`judge_*`) are populated by the post-stream LLM-as-judge
 * service (see `apps/api/src/services/chat/judge.ts`). They start NULL on
 * insert and are filled in asynchronously after the SSE stream closes —
 * the chat UX never waits on them.
 *
 * `parent_message_id` is a self-FK that links a refined assistant message
 * to the original it replaced. Used for forensic / fine-tuning data and
 * to stop the SPA from showing a [Refine] button on a message that's
 * already been refined.
 */
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    citationsJson: jsonb('citations_json').$type<Citation[]>(),
    tokenCount: integer('token_count'),
    parentMessageId: text('parent_message_id').references(
      (): AnyPgColumn => chatMessages.id,
      { onDelete: 'set null' },
    ),
    judgeVerdict: text('judge_verdict', { enum: ['approved', 'needs_refinement'] }),
    judgeScores: jsonb('judge_scores').$type<JudgeScores>(),
    judgeIssues: text('judge_issues').array(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('chat_user_doc_created_idx').on(t.userId, t.documentId, t.createdAt),
    index('chat_parent_idx').on(t.parentMessageId),
  ],
);

export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type NewChatMessageRow = typeof chatMessages.$inferInsert;
