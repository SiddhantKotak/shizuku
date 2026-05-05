import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { documents } from '@shizuku/db/schema';
import { buildTestApp, cleanupTestUsers, type TestAppHandle } from './helpers/buildTestApp.js';
import { uniqueEmail } from './helpers/uniqueEmail.js';
import { newId } from '../src/lib/id.js';

let handle: TestAppHandle;

beforeAll(async () => {
  handle = await buildTestApp();
  await handle.app.ready();
});

afterAll(async () => {
  await cleanupTestUsers(handle.app);
  await handle.app.close();
});

const PASSWORD = 'correct horse battery staple 9';

interface SessionResponse {
  data: { accessToken: string; user: { id: string; email: string; displayName: string } };
}

async function signup(): Promise<{ accessToken: string; userId: string }> {
  const email = uniqueEmail();
  const res = await handle.app.inject({
    method: 'POST',
    url: '/v1/auth/signup',
    payload: { email, password: PASSWORD, displayName: 'Docs Test' },
  });
  const body = res.json<SessionResponse>();
  return { accessToken: body.data.accessToken, userId: body.data.user.id };
}

/**
 * Insert a fake "ready" document directly. Used to test list/get/delete/signed-url
 * without going through the upload route (which requires a real PDF + OpenAI).
 * The R2 object isn't created — that's fine for routes that don't fetch it.
 */
async function seedDocument(
  userId: string,
  overrides: Partial<{ title: string; indexStatus: 'pending' | 'indexing' | 'ready' | 'failed' }> = {},
): Promise<string> {
  const id = newId('doc');
  await handle.app.db.insert(documents).values({
    id,
    userId,
    title: overrides.title ?? 'Sample Doc',
    filename: 'sample.pdf',
    byteSize: 1024,
    r2Key: `user-${userId}/documents/${id}.pdf`,
    indexStatus: overrides.indexStatus ?? 'ready',
    chunkCount: 0,
  });
  return id;
}

describe('GET /v1/documents', () => {
  it('returns an empty list for a fresh user', async () => {
    const { accessToken } = await signup();
    const res = await handle.app.inject({
      method: 'GET',
      url: '/v1/documents',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { documents: unknown[]; nextCursor: string | null } }>();
    expect(body.data.documents).toEqual([]);
    expect(body.data.nextCursor).toBeNull();
  });

  it('lists newest-first and only includes the user own docs', async () => {
    const a = await signup();
    const b = await signup();
    await seedDocument(a.userId, { title: 'A1' });
    await seedDocument(a.userId, { title: 'A2' });
    await seedDocument(b.userId, { title: 'B1' });

    const res = await handle.app.inject({
      method: 'GET',
      url: '/v1/documents',
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { documents: { title: string }[] } }>();
    expect(body.data.documents.map((d) => d.title)).toEqual(['A2', 'A1']);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await handle.app.inject({ method: 'GET', url: '/v1/documents' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /v1/documents/:id', () => {
  it('returns the document for the owner', async () => {
    const { accessToken, userId } = await signup();
    const docId = await seedDocument(userId, { title: 'Mine' });
    const res = await handle.app.inject({
      method: 'GET',
      url: `/v1/documents/${docId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { id: string; title: string } }>();
    expect(body.data.id).toBe(docId);
    expect(body.data.title).toBe('Mine');
  });

  it('returns 404 (NOT 403) for another user own document — no existence leak', async () => {
    const a = await signup();
    const b = await signup();
    const docId = await seedDocument(b.userId);
    const res = await handle.app.inject({
      method: 'GET',
      url: `/v1/documents/${docId}`,
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for a malformed id (not prefixed with doc_)', async () => {
    const { accessToken } = await signup();
    const res = await handle.app.inject({
      method: 'GET',
      url: '/v1/documents/garbage_id',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /v1/documents/:id', () => {
  it('deletes the row and returns 204', async () => {
    const { accessToken, userId } = await signup();
    const docId = await seedDocument(userId);
    const res = await handle.app.inject({
      method: 'DELETE',
      url: `/v1/documents/${docId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(204);
    const [row] = await handle.app.db
      .select()
      .from(documents)
      .where(eq(documents.id, docId));
    expect(row).toBeUndefined();
  });

  it('refuses to delete another user document (404)', async () => {
    const a = await signup();
    const b = await signup();
    const docId = await seedDocument(b.userId);
    const res = await handle.app.inject({
      method: 'DELETE',
      url: `/v1/documents/${docId}`,
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /v1/documents/:id/signed-url', () => {
  it('returns 409 when the index is still pending', async () => {
    const { accessToken, userId } = await signup();
    const docId = await seedDocument(userId, { indexStatus: 'pending' });
    const res = await handle.app.inject({
      method: 'GET',
      url: `/v1/documents/${docId}/signed-url`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('index_pending');
  });
});

describe('document_chunks BM25 column', () => {
  it('content_tsv generated column populates automatically on INSERT', async () => {
    const { userId } = await signup();
    const docId = await seedDocument(userId);
    const chunkId = newId('chk');
    await handle.app.db.execute(sql`
      INSERT INTO document_chunks
        (id, document_id, page_start, page_end, chunk_index, content, token_count)
      VALUES
        (${chunkId}, ${docId}, 1, 1, 0,
         ${'The quick brown fox jumps over the lazy dog.'}, 10)
    `);
    const result = await handle.app.db.execute(sql`
      SELECT content_tsv::text AS tsv
      FROM document_chunks
      WHERE id = ${chunkId}
    `);
    const row = (result as unknown as Array<{ tsv: string }>)[0];
    expect(row).toBeDefined();
    // ts_vector lexemes: stop-words removed, stems applied, positions attached.
    expect(row?.tsv).toMatch(/brown/);
    expect(row?.tsv).toMatch(/fox/);
    expect(row?.tsv).toMatch(/jump/);
    // ranking with a real query should hit
    const ranked = await handle.app.db.execute(sql`
      SELECT id FROM document_chunks
      WHERE id = ${chunkId}
        AND content_tsv @@ plainto_tsquery('english', 'fox jumping')
    `);
    expect((ranked as unknown as unknown[]).length).toBe(1);
  });
});
