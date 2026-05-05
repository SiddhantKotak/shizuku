import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { chatMessages, costCounters, documents } from '@shizuku/db/schema';
import { buildTestApp, cleanupTestUsers, type TestAppHandle } from './helpers/buildTestApp.js';
import { uniqueEmail } from './helpers/uniqueEmail.js';
import { newId } from '../src/lib/id.js';
import { makeOpenAIStub } from './helpers/openaiStub.js';

let handle: TestAppHandle;

beforeAll(async () => {
  handle = await buildTestApp();
  await handle.app.ready();
});

afterAll(async () => {
  await cleanupTestUsers(handle.app);
  await handle.app.close();
});

afterEach(() => {
  // Reset the cached OpenAI client between tests so each can install its own stub.
  // (Tests that don't install one will hit the unset-stub path and fail loudly.)
});

const PASSWORD = 'correct horse battery staple 9';

interface SessionResponse {
  data: { accessToken: string; user: { id: string } };
}

async function signupWithPet(): Promise<{ accessToken: string; userId: string }> {
  const email = uniqueEmail();
  const sres = await handle.app.inject({
    method: 'POST',
    url: '/v1/auth/signup',
    payload: { email, password: PASSWORD, displayName: 'Chat Test' },
  });
  const body = sres.json<SessionResponse>();
  await handle.app.inject({
    method: 'POST',
    url: '/v1/pets',
    headers: { authorization: `Bearer ${body.data.accessToken}` },
    payload: { species: 'ember', name: 'Cinder' },
  });
  return { accessToken: body.data.accessToken, userId: body.data.user.id };
}

/**
 * Create a fully indexed document with one chunk that matches a known query.
 * The chunk's embedding is set so vector search finds it; tsvector
 * generated column populates automatically.
 */
async function seedReadyDocument(userId: string): Promise<string> {
  const docId = newId('doc');
  await handle.app.db.insert(documents).values({
    id: docId,
    userId,
    title: 'Sample',
    filename: 'sample.pdf',
    byteSize: 1024,
    r2Key: `user-${userId}/documents/${docId}.pdf`,
    indexStatus: 'ready',
    pageCount: 3,
    chunkCount: 1,
  });

  // One chunk on page 1 with a 1536-dim embedding biased toward the
  // first dimension. The stub returns a zero query vector by default;
  // any non-zero chunk vector will rank somewhere — for our tests we
  // just need it to come back from the vector branch.
  const chunkId = newId('chk');
  const embedding = new Array<number>(1536).fill(0);
  embedding[0] = 1;
  await handle.app.db.execute(sql`
    INSERT INTO document_chunks
      (id, document_id, page_start, page_end, chunk_index, content, token_count, embedding)
    VALUES (
      ${chunkId}, ${docId}, 1, 1, 0,
      ${'The quick brown fox jumps over the lazy dog on page 1.'}, 12,
      ${`[${embedding.join(',')}]`}::vector
    )
  `);
  return docId;
}

/**
 * Parse SSE response payload into ordered (event, data) tuples.
 */
function parseSse(payload: string): Array<{ event: string; data: unknown }> {
  const out: Array<{ event: string; data: unknown }> = [];
  for (const frame of payload.split('\n\n')) {
    if (!frame.trim()) continue;
    let event = 'message';
    let dataRaw = '';
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataRaw += line.slice(5).trim();
    }
    let data: unknown = null;
    if (dataRaw) {
      try {
        data = JSON.parse(dataRaw);
      } catch {
        data = dataRaw;
      }
    }
    out.push({ event, data });
  }
  return out;
}

/** Wait until the predicate returns truthy or `timeoutMs` elapses. */
async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (v: T) => boolean,
  timeoutMs = 5000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (predicate(v)) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('waitFor timed out');
}

describe('POST /v1/documents/:id/chat — happy path', () => {
  it('streams token events, persists message + judge, increments cost counter', async () => {
    const stub = makeOpenAIStub({
      streamTokens: ['Sure! ', 'According to the doc, ', 'the fox jumps. ', '[p.1]'],
    });
    stub.install();

    try {
      const { accessToken, userId } = await signupWithPet();
      const docId = await seedReadyDocument(userId);

      const res = await handle.app.inject({
        method: 'POST',
        url: `/v1/documents/${docId}/chat`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { message: 'What happens on page 1?' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');

      const events = parseSse(res.payload);
      const tokenEvents = events.filter((e) => e.event === 'token');
      expect(tokenEvents.length).toBe(4);
      const fullText = tokenEvents
        .map((e) => (e.data as { content: string }).content)
        .join('');
      expect(fullText).toContain('[p.1]');

      const doneEvent = events.find((e) => e.event === 'done');
      expect(doneEvent).toBeDefined();
      const done = doneEvent?.data as { messageId: string; citations: { page: number }[] };
      expect(done.messageId).toMatch(/^cmsg_/);
      expect(done.citations.map((c) => c.page)).toContain(1);

      // user + assistant rows persisted.
      const rows = await handle.app.db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.userId, userId));
      expect(rows.length).toBe(2);
      expect(rows.find((r) => r.role === 'user')?.content).toBe('What happens on page 1?');
      const assistant = rows.find((r) => r.role === 'assistant');
      expect(assistant?.content).toBe(fullText);

      // Cost counter incremented.
      const [counter] = await handle.app.db
        .select()
        .from(costCounters)
        .where(eq(costCounters.userId, userId));
      expect(counter?.chatsToday).toBe(1);

      // Judge runs async — wait for it to commit.
      const judged = await waitFor(
        async () => {
          const [r] = await handle.app.db
            .select()
            .from(chatMessages)
            .where(eq(chatMessages.id, assistant!.id));
          return r;
        },
        (r) => r?.judgeVerdict !== null,
      );
      expect(judged?.judgeVerdict).toBe('approved');
      expect(judged?.judgeScores).toEqual({
        citesPages: 2,
        inCharacter: 2,
        grounded: 2,
        helpful: 2,
      });
    } finally {
      stub.uninstall();
    }
  });
});

describe('POST /v1/documents/:id/chat — judge needs_refinement', () => {
  it('emits a `refinable` event after `done` and persists needs_refinement verdict', async () => {
    const stub = makeOpenAIStub({
      streamTokens: ['I made up an answer with no citation.'],
      judgeReport: {
        scores: { citesPages: 0, inCharacter: 1, grounded: 0, helpful: 1 },
        total: 2,
        issues: ['no_citations', 'not_grounded'],
        verdict: 'needs_refinement',
      },
    });
    stub.install();

    try {
      const { accessToken, userId } = await signupWithPet();
      const docId = await seedReadyDocument(userId);

      const res = await handle.app.inject({
        method: 'POST',
        url: `/v1/documents/${docId}/chat`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { message: 'Tell me anything.' },
      });
      expect(res.statusCode).toBe(200);

      // The judge runs after `done` via setImmediate. We wait for the
      // assistant row to have the verdict, then re-parse the payload —
      // the `refinable` frame gets written before sse.close().
      const [assistantRow] = await handle.app.db
        .select()
        .from(chatMessages)
        .where(and(eq(chatMessages.userId, userId), eq(chatMessages.role, 'assistant')));

      const judged = await waitFor(
        async () => {
          const [r] = await handle.app.db
            .select()
            .from(chatMessages)
            .where(eq(chatMessages.id, assistantRow!.id));
          return r;
        },
        (r) => r?.judgeVerdict !== null,
      );
      expect(judged?.judgeVerdict).toBe('needs_refinement');
      expect(judged?.judgeIssues).toEqual(['no_citations', 'not_grounded']);

      // The `refinable` frame is written to reply.raw before close —
      // light-my-request captures it in res.payload.
      const events = parseSse(res.payload);
      const refinable = events.find((e) => e.event === 'refinable');
      expect(refinable).toBeDefined();
      const r = refinable?.data as { messageId: string; total: number };
      expect(r.messageId).toBe(assistantRow!.id);
      expect(r.total).toBe(2);
    } finally {
      stub.uninstall();
    }
  });
});

describe('POST /v1/documents/:id/chat/:messageId/refine', () => {
  it('re-streams with judge issues injected and persists with parent_message_id', async () => {
    // First chat: judge flags the response.
    const flaggingStub = makeOpenAIStub({
      streamTokens: ['no citations here.'],
      judgeReport: {
        scores: { citesPages: 0, inCharacter: 1, grounded: 0, helpful: 1 },
        total: 2,
        issues: ['no_citations'],
        verdict: 'needs_refinement',
      },
    });
    flaggingStub.install();

    const { accessToken, userId } = await signupWithPet();
    const docId = await seedReadyDocument(userId);

    await handle.app.inject({
      method: 'POST',
      url: `/v1/documents/${docId}/chat`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { message: 'tell me about the doc' },
    });

    // Wait for the judge to commit so the assistant row has needs_refinement.
    const [origAssistant] = await handle.app.db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.userId, userId), eq(chatMessages.role, 'assistant')));
    await waitFor(
      async () => {
        const [r] = await handle.app.db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.id, origAssistant!.id));
        return r;
      },
      (r) => r?.judgeVerdict === 'needs_refinement',
    );
    flaggingStub.uninstall();

    // Now refine: install a fresh stub that produces a properly-cited reply.
    const refineStub = makeOpenAIStub({
      streamTokens: ['Better answer with [p.1] citation.'],
      // Judge approves the refinement.
    });
    refineStub.install();

    try {
      const refineRes = await handle.app.inject({
        method: 'POST',
        url: `/v1/documents/${docId}/chat/${origAssistant!.id}/refine`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(refineRes.statusCode).toBe(200);
      const events = parseSse(refineRes.payload);
      const done = events.find((e) => e.event === 'done');
      const { messageId: refinedId, parentMessageId } = done?.data as {
        messageId: string;
        parentMessageId: string;
      };
      expect(refinedId).toMatch(/^cmsg_/);
      expect(parentMessageId).toBe(origAssistant!.id);

      // The refined row exists with the right link.
      const [refined] = await handle.app.db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.id, refinedId));
      expect(refined?.parentMessageId).toBe(origAssistant!.id);
      expect(refined?.role).toBe('assistant');
      expect(refined?.content).toContain('[p.1]');
    } finally {
      refineStub.uninstall();
    }
  });

  it('refuses to refine a message that was approved (409)', async () => {
    const stub = makeOpenAIStub();
    stub.install();
    try {
      const { accessToken, userId } = await signupWithPet();
      const docId = await seedReadyDocument(userId);
      await handle.app.inject({
        method: 'POST',
        url: `/v1/documents/${docId}/chat`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { message: 'hi' },
      });
      const [assistant] = await handle.app.db
        .select()
        .from(chatMessages)
        .where(and(eq(chatMessages.userId, userId), eq(chatMessages.role, 'assistant')));
      await waitFor(
        async () => {
          const [r] = await handle.app.db
            .select()
            .from(chatMessages)
            .where(eq(chatMessages.id, assistant!.id));
          return r;
        },
        (r) => r?.judgeVerdict === 'approved',
      );
      const res = await handle.app.inject({
        method: 'POST',
        url: `/v1/documents/${docId}/chat/${assistant!.id}/refine`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(res.statusCode).toBe(409);
    } finally {
      stub.uninstall();
    }
  });
});

describe('POST /v1/documents/:id/chat — guards', () => {
  it('rejects when no active pet exists (409 conflict)', async () => {
    const stub = makeOpenAIStub();
    stub.install();
    try {
      // Sign up but skip pet creation.
      const email = uniqueEmail();
      const sres = await handle.app.inject({
        method: 'POST',
        url: '/v1/auth/signup',
        payload: { email, password: PASSWORD, displayName: 'NoPet' },
      });
      const { accessToken, user } = sres.json<SessionResponse>().data;
      const docId = await seedReadyDocument(user.id);

      const res = await handle.app.inject({
        method: 'POST',
        url: `/v1/documents/${docId}/chat`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { message: 'hi' },
      });
      expect(res.statusCode).toBe(409);
    } finally {
      stub.uninstall();
    }
  });

  it("rejects when the document isn't `ready` (409 index_pending)", async () => {
    const stub = makeOpenAIStub();
    stub.install();
    try {
      const { accessToken, userId } = await signupWithPet();
      const docId = newId('doc');
      await handle.app.db.insert(documents).values({
        id: docId,
        userId,
        title: 'Pending',
        filename: 'p.pdf',
        byteSize: 1024,
        r2Key: `user-${userId}/documents/${docId}.pdf`,
        indexStatus: 'pending',
      });
      const res = await handle.app.inject({
        method: 'POST',
        url: `/v1/documents/${docId}/chat`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { message: 'hi' },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('index_pending');
    } finally {
      stub.uninstall();
    }
  });
});
