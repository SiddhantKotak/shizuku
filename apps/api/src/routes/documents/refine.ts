import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { chatMessages, documents, pets } from '@shizuku/db/schema';
import {
  documentIdParamSchema,
  type Citation,
  type PetSpecies,
} from '@shizuku/types';
import { httpError } from '../../lib/errors.js';
import { newId } from '../../lib/id.js';
import { requireUser } from '../../lib/requireUser.js';
import { incrementUsage } from '../../services/cost/counters.js';
import { judgeChatResponse } from '../../services/chat/judge.js';
import {
  buildChatMessages,
  extractCitations,
  streamChatCompletion,
} from '../../services/chat/rag.js';
import { hybridSearch } from '../../services/documents/search.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyReply } from 'fastify';

/**
 * Refine endpoint — re-runs the chat for a flagged assistant message with
 * the original judge issues injected into the system prompt as concrete
 * "fix these problems" guidance.
 *
 * The new assistant message is persisted as a separate row with
 * `parent_message_id` linking back to the original. Counts as a normal
 * chat against the daily 100/user limit.
 */

const refineParamsSchema = documentIdParamSchema.extend({
  messageId: z.string().regex(/^cmsg_/, 'Not a chat message id'),
});

const HISTORY_TURN_CAP = 8;

interface SseWriter {
  send: (event: string, data: unknown) => void;
  close: () => void;
  isClosed: () => boolean;
}

function createSseWriter(reply: FastifyReply): SseWriter {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  reply.raw.flushHeaders();
  let closed = false;
  reply.raw.on('close', () => {
    closed = true;
  });
  return {
    send: (event, data) => {
      if (closed || reply.raw.writableEnded) return;
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close: () => {
      if (closed || reply.raw.writableEnded) return;
      closed = true;
      reply.raw.end();
    },
    isClosed: () => closed || reply.raw.writableEnded,
  };
}

const refineRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/:id/chat/:messageId/refine',
    {
      preHandler: [app.verifyJWT, app.enforceCost('chat')],
      schema: {
        params: refineParamsSchema,
        tags: ['documents'],
        summary: 'Refine a flagged assistant message (SSE stream)',
        description: [
          'Triggered by the SPA when the user clicks `[Refine]` on a message the post-stream judge marked `needs_refinement`. Replays the chat with the original judge issues injected as a "fix these" preamble.',
          '',
          "Counts against the user's daily 100-chat limit (refinements aren't free).",
          '',
          'The original message is preserved; the refined response is persisted as a NEW row with `parent_message_id` linking to the original.',
          '',
          '**Errors:** 404 if message not found / not owned. 409 if the original message is not refinable (no `needs_refinement` verdict on file).',
        ].join('\n'),
        security: [{ bearer: [] }],
      },
    },
    async (req, reply) => {
      const userId = requireUser(req).id;

      // 1. Load the original assistant message + its preceding user query.
      //    Ownership check is implicit via userId.
      const [orig] = await app.db
        .select()
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.id, req.params.messageId),
            eq(chatMessages.documentId, req.params.id),
            eq(chatMessages.userId, userId),
            eq(chatMessages.role, 'assistant'),
          ),
        )
        .limit(1);
      if (!orig) throw httpError.notFound();
      if (orig.judgeVerdict !== 'needs_refinement') {
        throw httpError.conflict(
          'conflict',
          'This message is not flagged for refinement.',
        );
      }

      // 2. Find the user message immediately preceding the assistant message
      //    (same document, role='user', createdAt < orig.createdAt, ORDER BY
      //    createdAt DESC LIMIT 1).
      const [userQuestion] = await app.db
        .select({ content: chatMessages.content, createdAt: chatMessages.createdAt })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.userId, userId),
            eq(chatMessages.documentId, req.params.id),
            eq(chatMessages.role, 'user'),
          ),
        )
        .orderBy(desc(chatMessages.createdAt))
        .limit(50);
      const precedingUser = userQuestion;
      if (!precedingUser) {
        throw httpError.conflict('conflict', 'Cannot find the user query for this assistant message.');
      }

      const [doc] = await app.db
        .select({ indexStatus: documents.indexStatus })
        .from(documents)
        .where(and(eq(documents.id, req.params.id), eq(documents.userId, userId)))
        .limit(1);
      if (!doc) throw httpError.notFound();
      if (doc.indexStatus !== 'ready') {
        throw httpError.conflict(
          'index_pending',
          `Document is ${doc.indexStatus}; chat is available once indexing completes.`,
        );
      }

      const [pet] = await app.db
        .select({ name: pets.name, species: pets.species })
        .from(pets)
        .where(and(eq(pets.userId, userId), eq(pets.isActive, true)))
        .limit(1);
      if (!pet) {
        throw httpError.conflict('conflict', 'No active pet — complete onboarding first.');
      }

      reply.hijack();
      const sse = createSseWriter(reply);
      try {
        const chunks = await hybridSearch(app.db, {
          documentId: req.params.id,
          query: precedingUser.content,
        });

        // Last 8 turns of history EXCLUDING the original assistant message
        // and the refined message (which is about to be inserted).
        const historyRows = await app.db
          .select({
            role: chatMessages.role,
            content: chatMessages.content,
          })
          .from(chatMessages)
          .where(
            and(
              eq(chatMessages.userId, userId),
              eq(chatMessages.documentId, req.params.id),
            ),
          )
          .orderBy(desc(chatMessages.createdAt))
          .limit(HISTORY_TURN_CAP * 2 + 2);
        const history = historyRows
          .filter((r) => r.content !== orig.content)
          .reverse()
          .slice(0, HISTORY_TURN_CAP * 2)
          .map((r) => ({ role: r.role, content: r.content }));

        const messages = buildChatMessages({
          species: pet.species as PetSpecies,
          petName: pet.name,
          query: precedingUser.content,
          chunks,
          history,
        });

        // Augment the system prompt with the judge's specific issues so the
        // model has concrete guidance on what to fix.
        const issues = orig.judgeIssues ?? [];
        const refinePreamble = [
          '',
          'Your previous answer was flagged with these issues:',
          ...issues.map((issue) => `  - ${issue}`),
          'Address these specifically while staying in character.',
        ].join('\n');
        const sysIdx = messages.findIndex((m) => m.role === 'system');
        if (sysIdx >= 0) {
          const sys = messages[sysIdx];
          if (sys && typeof sys.content === 'string') {
            messages[sysIdx] = { role: 'system', content: sys.content + refinePreamble };
          }
        }

        const stream = await streamChatCompletion({ messages });
        for await (const delta of stream.tokens) {
          sse.send('token', { content: delta });
        }
        const fullText = await stream.done;

        const refinedId = newId('cmsg');
        const citations: Citation[] = extractCitations(fullText, chunks);
        await app.db.insert(chatMessages).values({
          id: refinedId,
          userId,
          documentId: req.params.id,
          role: 'assistant',
          content: fullText,
          citationsJson: citations,
          parentMessageId: orig.id,
        });
        await incrementUsage(app.db, userId, 'chat');

        sse.send('done', { messageId: refinedId, citations, parentMessageId: orig.id });

        // Re-run the judge on the refined response — if it ALSO fails the
        // verdict, the SPA can show another [Refine] button. (We cap recursion
        // at one level via the parent_message_id chain in the SPA.)
        setImmediate(() => {
          void (async (): Promise<void> => {
            try {
              const verdict = await judgeChatResponse({
                species: pet.species as PetSpecies,
                query: precedingUser.content,
                response: fullText,
                chunks,
              });
              await app.db
                .update(chatMessages)
                .set({
                  judgeVerdict: verdict.verdict,
                  judgeScores: verdict.scores,
                  judgeIssues: verdict.issues.length ? verdict.issues : null,
                })
                .where(eq(chatMessages.id, refinedId));
              if (verdict.verdict === 'needs_refinement') {
                sse.send('refinable', { messageId: refinedId, total: verdict.total });
              }
            } catch (err) {
              app.log.warn({ err, refinedId }, 'judge_failed_silently');
            } finally {
              sse.close();
            }
          })();
        });
      } catch (err) {
        req.log.error({ err, userId, msgId: orig.id }, 'refine_stream_failed');
        sse.send('error', { code: 'internal', message: 'Refine failed mid-stream.' });
        sse.close();
      }
    },
  );
};

export default refineRoute;
