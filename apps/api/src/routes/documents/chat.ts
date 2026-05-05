import { and, desc, eq } from 'drizzle-orm';
import { chatMessages, documents, pets } from '@shizuku/db/schema';
import {
  documentChatBodySchema,
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
import { hybridSearch, type RankedChunk } from '../../services/documents/search.js';
import { awardPetXp, isQualityChat } from '../../services/pets/xp.js';
import { bumpQuestProgress } from '../../services/quests/progress.js';
import { bumpDailyStat } from '../../services/stats/aggregate.js';
import { markActivity } from '../../services/streak/compute.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyInstance, FastifyReply } from 'fastify';

/**
 * RAG chat — POST /v1/documents/:id/chat (SSE) — Slice 1's signature feature.
 *
 * Flow:
 *   1. cost-guard preHandler — 429 if user has hit chats_today.
 *   2. Per-user concurrency lock (in-process Map) — prevents two browser tabs
 *      from racing the same chat. Returns 409 chat_in_progress instead of
 *      letting the second request stomp the first.
 *   3. Hybrid retrieval (vector + BM25 + RRF + MMR) → top-5 chunks.
 *   4. Build prompt (per-species voice + chunks + last 8 turns).
 *   5. Stream gpt-4o tokens to the client as `event: token`.
 *   6. After stream closes: persist user+assistant messages, increment
 *      `cost_counters.chats_today`, emit `event: done` with citations.
 *   7. Fire judge call asynchronously (does NOT block close). Judge result
 *      persists to chat_messages. If verdict='needs_refinement', emit
 *      `event: refinable` before the final connection close.
 */

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

/** In-process per-user serialization. Map userId → in-flight promise. */
const inflight = new Map<string, true>();

const HISTORY_TURN_CAP = 8;
const CHAT_PET_XP = 10;

const chatRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/:id/chat',
    {
      preHandler: [app.verifyJWT, app.enforceCost('chat')],
      schema: {
        params: documentIdParamSchema,
        body: documentChatBodySchema,
        tags: ['documents'],
        summary: 'Chat with the pet about a specific document (SSE stream)',
        description: [
          "POST a message; receive a streaming SSE response with the pet's reply.",
          '',
          'Pipeline: hybrid retrieval (vector + BM25 + RRF + MMR top-5) → gpt-4o stream → atomic persist + cost increment → post-stream judge (gpt-4o-mini, async).',
          '',
          'Events:',
          '```',
          'event: token       data: { content }                       ← repeated as tokens arrive',
          'event: done        data: { messageId, citations[] }        ← terminal success',
          'event: refinable   data: { messageId }                     ← only if judge flags',
          'event: error       data: { code, message }                 ← terminal failure',
          '```',
          '',
          '**Cost guards:** preHandler rejects with 429 `cost_limit_exceeded` if user has hit 100 chats today. Increment fires AFTER successful generation.',
          '',
          '**Concurrency:** one chat per user at a time. Concurrent requests get 409 `chat_in_progress`. Saves cost + prevents racing assistant messages.',
        ].join('\n'),
        security: [{ bearer: [] }],
      },
    },
    async (req, reply) => {
      const userId = requireUser(req).id;

      if (inflight.has(userId)) {
        throw httpError.conflict('conflict', 'Another chat is already in progress for this user');
      }

      // 1. Verify ownership of document + load pet (one query each).
      const [doc] = await app.db
        .select({ id: documents.id, indexStatus: documents.indexStatus })
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

      // 2. Lock + start streaming. From here on we own the response — no
      //    `throw` after `reply.hijack()`.
      inflight.set(userId, true);
      reply.hijack();
      const sse = createSseWriter(reply);

      try {
        // 3. Hybrid retrieval.
        const chunks = await hybridSearch(app.db, {
          documentId: doc.id,
          query: req.body.message,
        });

        // 4. Load last 8 turns for this user/document, oldest first.
        const historyRows = await app.db
          .select({ role: chatMessages.role, content: chatMessages.content })
          .from(chatMessages)
          .where(
            and(eq(chatMessages.userId, userId), eq(chatMessages.documentId, doc.id)),
          )
          .orderBy(desc(chatMessages.createdAt))
          .limit(HISTORY_TURN_CAP * 2);
        const history = historyRows
          .reverse()
          .map((r) => ({ role: r.role, content: r.content }));

        // 5. Build prompt + stream.
        const messages = buildChatMessages({
          species: pet.species as PetSpecies,
          petName: pet.name,
          query: req.body.message,
          chunks,
          history,
        });
        const stream = await streamChatCompletion({ messages });

        for await (const delta of stream.tokens) {
          sse.send('token', { content: delta });
          if (sse.isClosed()) {
            // Client disconnected. Continue draining the stream so the
            // generator finishes cleanly + we still persist + count it.
          }
        }
        const fullText = await stream.done;

        // 6. Atomic persist + counter bump. Failures here mark an error
        //    SSE frame so the SPA can warn but keep the streamed text on
        //    screen (the user already saw it; we just couldn't save it).
        const userMsgId = newId('cmsg');
        const assistantMsgId = newId('cmsg');
        const citations: Citation[] = extractCitations(fullText, chunks);

        await app.db.transaction(async (tx) => {
          await tx.insert(chatMessages).values([
            {
              id: userMsgId,
              userId,
              documentId: doc.id,
              role: 'user',
              content: req.body.message,
            },
            {
              id: assistantMsgId,
              userId,
              documentId: doc.id,
              role: 'assistant',
              content: fullText,
              citationsJson: citations,
            },
          ]);
        });
        await incrementUsage(app.db, userId, 'chat');

        // Side-effect bundle. Each is independently idempotent enough that
        // a half-applied bundle is acceptable rather than rolled back.
        // Quality gate for pet XP: substantive question (length > 30 + ?).
        const qualityChat = isQualityChat(req.body.message);
        const sideEffects: Array<Promise<unknown>> = [
          bumpDailyStat(app.db, userId, 'chats'),
          bumpQuestProgress(app.db, userId, 'chats'),
          markActivity(app.db, userId),
        ];
        if (qualityChat) {
          sideEffects.push(awardPetXp(app.db, userId, CHAT_PET_XP));
        }
        await Promise.all(sideEffects).catch((err) => {
          // Stats/quest/streak failures shouldn't blow up the response —
          // log and move on. The chat itself already committed.
          req.log.warn({ err, userId }, 'chat_side_effects_partial_failure');
        });

        sse.send('done', { messageId: assistantMsgId, citations });

        // 7. Fire judge AFTER `done` so the SPA renders the message immediately.
        //    setImmediate detaches the work from the SSE close path.
        setImmediate(() => {
          void runJudgeAndPersist(app, {
            assistantMsgId,
            species: pet.species as PetSpecies,
            query: req.body.message,
            response: fullText,
            chunks,
            sse,
          }).finally(() => {
            sse.close();
            inflight.delete(userId);
          });
        });
        return; // hijacked — Fastify won't touch the response
      } catch (err) {
        req.log.error({ err, userId, docId: doc.id }, 'chat_stream_failed');
        sse.send('error', { code: 'internal', message: 'Chat failed mid-stream.' });
        sse.close();
        inflight.delete(userId);
        return;
      }
    },
  );
};

/**
 * Run the post-stream judge and write the verdict back to the assistant
 * message. Errors are logged but never re-thrown — a missing verdict just
 * means no [Refine] affordance, which is acceptable.
 */
async function runJudgeAndPersist(
  app: FastifyInstance,
  args: {
    assistantMsgId: string;
    species: PetSpecies;
    query: string;
    response: string;
    chunks: RankedChunk[];
    sse: SseWriter;
  },
): Promise<void> {
  try {
    const verdict = await judgeChatResponse({
      species: args.species,
      query: args.query,
      response: args.response,
      chunks: args.chunks,
    });
    await app.db
      .update(chatMessages)
      .set({
        judgeVerdict: verdict.verdict,
        judgeScores: verdict.scores,
        judgeIssues: verdict.issues.length ? verdict.issues : null,
      })
      .where(eq(chatMessages.id, args.assistantMsgId));

    if (verdict.verdict === 'needs_refinement') {
      args.sse.send('refinable', { messageId: args.assistantMsgId, total: verdict.total });
    }
  } catch (err) {
    app.log.warn({ err, assistantMsgId: args.assistantMsgId }, 'judge_failed_silently');
  }
}

const chatHistoryRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/:id/chat',
    {
      preHandler: [app.verifyJWT],
      schema: {
        params: documentIdParamSchema,
        tags: ['documents'],
        summary: 'List the chat history for a document (last 50, oldest-first)',
        description: [
          'Returns the last 50 chat messages for the authenticated user on this document, oldest-first (chat-app order).',
          '',
          'Each message includes the assistant judge verdict if it has been computed, so the SPA can render a [Refine] button retroactively after a refresh.',
        ].join('\n'),
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      const userId = requireUser(req).id;
      const [doc] = await app.db
        .select({ id: documents.id })
        .from(documents)
        .where(and(eq(documents.id, req.params.id), eq(documents.userId, userId)))
        .limit(1);
      if (!doc) throw httpError.notFound();

      // Pull newest 50, then reverse for oldest-first display order.
      const rows = await app.db
        .select()
        .from(chatMessages)
        .where(
          and(eq(chatMessages.userId, userId), eq(chatMessages.documentId, doc.id)),
        )
        .orderBy(desc(chatMessages.createdAt))
        .limit(50);

      const ordered = rows
        .slice()
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      return {
        data: ordered.map((row) => ({
          id: row.id,
          documentId: row.documentId,
          role: row.role,
          content: row.content,
          citations: row.citationsJson ?? null,
          parentMessageId: row.parentMessageId,
          judgeVerdict: row.judgeVerdict,
          judgeScores: row.judgeScores,
          judgeIssues: row.judgeIssues,
          createdAt: row.createdAt.toISOString(),
        })),
      };
    },
  );
};

const documentChatRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(chatRoute);
  await app.register(chatHistoryRoute);
};

export default documentChatRoutes;
