/**
 * Pure / DB-free helpers for hybrid retrieval. Extracted so unit tests can
 * exercise RRF + MMR without booting Postgres or stubbing pgvector queries.
 *
 * The "real" entrypoint lives in `search.ts` (`hybridSearch`) and composes
 * these with two SQL branches (vector + BM25).
 */

export interface CandidateRow {
  id: string;
  document_id: string;
  page_start: number;
  page_end: number;
  chunk_index: number;
  content: string;
  /** pgvector text format `[0.1,0.2,…]` or null for BM25-only chunks. */
  embedding: string | null;
}

export interface RankedRow extends CandidateRow {
  rank: number;
}

export interface FusedRow extends CandidateRow {
  score: number;
}

/** Reciprocal Rank Fusion paper's k=60 default. */
export const RRF_K = 60;

/** MMR relevance/diversity tradeoff. λ=1 → pure relevance, λ=0 → pure diversity. */
export const MMR_LAMBDA = 0.7;

export function assignRanks(rows: CandidateRow[]): RankedRow[] {
  return rows.map((row, idx) => ({ ...row, rank: idx + 1 }));
}

/**
 * Reciprocal Rank Fusion. Score = Σ 1/(k + rank) across each ranking the
 * chunk appears in. Battle-tested combiner that needs no per-branch score
 * normalization.
 */
export function reciprocalRankFusion(
  vectorRows: RankedRow[],
  bm25Rows: RankedRow[],
): FusedRow[] {
  const scoreById = new Map<string, FusedRow>();
  const accumulate = (rows: RankedRow[]): void => {
    for (const r of rows) {
      const existing = scoreById.get(r.id);
      const inc = 1 / (RRF_K + r.rank);
      if (existing) {
        existing.score += inc;
      } else {
        const { rank: _rank, ...rest } = r;
        scoreById.set(r.id, { ...rest, score: inc });
      }
    }
  };
  accumulate(vectorRows);
  accumulate(bm25Rows);
  return Array.from(scoreById.values()).sort((a, b) => b.score - a.score);
}

/**
 * Maximal Marginal Relevance. Greedy: pick the highest-relevance candidate
 * first, then repeatedly pick the one that maximizes
 *   λ * relevance(c, q) - (1-λ) * max sim(c, picked)
 * until we have `topK` items or no candidates remain.
 *
 * Candidates without an embedding (BM25-only chunks) are kept but contribute
 * 0 to similarity-with-picked and 0 to relevance — they only get picked if
 * the embedded candidates run out.
 */
export function maximalMarginalRelevance(
  fused: FusedRow[],
  queryVec: number[],
  topK: number,
): FusedRow[] {
  if (fused.length <= topK) return fused.slice();

  const withVec: Array<FusedRow & { vector: number[] | null }> = fused.map((c) => ({
    ...c,
    vector: parseVectorLiteral(c.embedding),
  }));

  // Initial pick: highest relevance to query.
  withVec.sort((a, b) => relevance(b.vector, queryVec) - relevance(a.vector, queryVec));
  const first = withVec.shift();
  if (!first) return [];
  const picked: typeof withVec = [first];

  while (picked.length < topK && withVec.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < withVec.length; i++) {
      const cand = withVec[i];
      if (!cand) continue;
      const rel = relevance(cand.vector, queryVec);
      const maxSim = picked.reduce(
        (acc, p) => Math.max(acc, similarity(cand.vector, p.vector)),
        0,
      );
      const mmr = MMR_LAMBDA * rel - (1 - MMR_LAMBDA) * maxSim;
      if (mmr > bestScore) {
        bestScore = mmr;
        bestIdx = i;
      }
    }
    const next = withVec.splice(bestIdx, 1)[0];
    if (next) picked.push(next);
  }
  return picked.map(({ vector: _v, ...rest }) => rest);
}

function relevance(candVec: number[] | null, queryVec: number[]): number {
  return candVec ? cosine(candVec, queryVec) : 0;
}

function similarity(a: number[] | null, b: number[] | null): number {
  return a && b ? cosine(a, b) : 0;
}

export function parseVectorLiteral(s: string | null | undefined): number[] | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  const inner = trimmed.slice(1, -1);
  if (inner.length === 0) return null;
  const parts = inner.split(',');
  const out = new Array<number>(parts.length);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === undefined) return null;
    const v = Number(part);
    if (!Number.isFinite(v)) return null;
    out[i] = v;
  }
  return out;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
