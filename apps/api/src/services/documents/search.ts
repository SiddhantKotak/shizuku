import { sql } from 'drizzle-orm';
import type { Db } from '@shizuku/db';
import { getOpenAIClient } from '../ai/openai.js';
import { env } from '@shizuku/config';
import {
  assignRanks,
  maximalMarginalRelevance,
  reciprocalRankFusion,
  type CandidateRow,
} from './searchInternals.js';

/**
 * Hybrid retrieval: dense vector + sparse BM25-style → Reciprocal Rank Fusion
 * → MMR rerank.
 *
 * Why hybrid rather than vector-only:
 *   - Vector search smears proper nouns, formulas, character/place names.
 *   - tsvector / GIN (Postgres FTS) catches them but misses paraphrases.
 *   - RRF combines both rankings without needing score normalization.
 *
 * Why MMR rerank:
 *   - Top-K vector neighbors are often near-duplicates of each other (same
 *     paragraph chunk-overlap window). The pet's response gets repetitive
 *     context. MMR penalizes a candidate by its similarity to already-picked
 *     items, producing a diverse but still relevant top-K.
 *
 * Pure RRF + MMR + cosine helpers live in `./searchInternals.ts` so unit
 * tests can exercise them without booting Postgres or stubbing pgvector.
 */

const VECTOR_TOP_K = 20;
const BM25_TOP_K = 20;
/** Final post-MMR cap — number of chunks fed into the prompt. */
const FINAL_TOP_K = 5;
/** Drop chunks whose post-fusion score is too weak to bother including. */
const MIN_FUSED_SCORE = 1 / (60 + VECTOR_TOP_K + BM25_TOP_K);
/** HNSW ef_search per query — balances recall vs. latency. */
const HNSW_EF_SEARCH = 40;

export interface RankedChunk {
  chunkId: string;
  documentId: string;
  pageStart: number;
  pageEnd: number;
  chunkIndex: number;
  content: string;
  /** Final RRF-fused score (post-MMR diversification keeps the original score). */
  score: number;
}

export async function hybridSearch(
  db: Db,
  args: { documentId: string; query: string; topK?: number },
): Promise<RankedChunk[]> {
  const topK = args.topK ?? FINAL_TOP_K;

  const client = getOpenAIClient();
  const embedRes = await client.embeddings.create({
    model: env.OPENAI_EMBEDDING_MODEL,
    input: args.query,
  });
  const qVec = embedRes.data[0]?.embedding;
  if (!qVec) throw new Error('embedding_returned_no_vector');
  const qVecLiteral = `[${qVec.join(',')}]`;

  const [vectorRows, bm25Rows] = await Promise.all([
    runVectorBranch(db, args.documentId, qVecLiteral),
    runBm25Branch(db, args.documentId, args.query),
  ]);

  const fused = reciprocalRankFusion(
    assignRanks(vectorRows),
    assignRanks(bm25Rows),
  );
  const survivors = fused.filter((c) => c.score >= MIN_FUSED_SCORE);
  if (survivors.length === 0) return [];

  const ranked = maximalMarginalRelevance(survivors, qVec, topK);

  return ranked.map((r) => ({
    chunkId: r.id,
    documentId: r.document_id,
    pageStart: r.page_start,
    pageEnd: r.page_end,
    chunkIndex: r.chunk_index,
    content: r.content,
    score: r.score,
  }));
}

async function runVectorBranch(
  db: Db,
  documentId: string,
  qVecLiteral: string,
): Promise<CandidateRow[]> {
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL hnsw.ef_search = ${HNSW_EF_SEARCH}`));
    return tx.execute(sql`
      SELECT id, document_id, page_start, page_end, chunk_index, content,
             embedding::text AS embedding
      FROM document_chunks
      WHERE document_id = ${documentId}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${qVecLiteral}::vector
      LIMIT ${VECTOR_TOP_K}
    `);
  });
  return result as unknown as CandidateRow[];
}

async function runBm25Branch(
  db: Db,
  documentId: string,
  query: string,
): Promise<CandidateRow[]> {
  const result = await db.execute(sql`
    SELECT id, document_id, page_start, page_end, chunk_index, content,
           embedding::text AS embedding
    FROM document_chunks
    WHERE document_id = ${documentId}
      AND content_tsv @@ plainto_tsquery('english', ${query})
    ORDER BY ts_rank_cd(content_tsv, plainto_tsquery('english', ${query})) DESC
    LIMIT ${BM25_TOP_K}
  `);
  return result as unknown as CandidateRow[];
}
