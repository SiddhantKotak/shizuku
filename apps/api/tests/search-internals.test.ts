import { describe, expect, it } from 'vitest';
import {
  assignRanks,
  cosine,
  maximalMarginalRelevance,
  parseVectorLiteral,
  reciprocalRankFusion,
  RRF_K,
  type CandidateRow,
  type FusedRow,
} from '../src/services/documents/searchInternals.js';

function chunk(id: string, embedding: number[] | null = null): CandidateRow {
  return {
    id,
    document_id: 'doc_test',
    page_start: 1,
    page_end: 1,
    chunk_index: 0,
    content: id,
    embedding: embedding ? `[${embedding.join(',')}]` : null,
  };
}

describe('reciprocalRankFusion', () => {
  it('gives chunks present in both branches a higher score than single-branch chunks', () => {
    const vec = assignRanks([chunk('a'), chunk('b'), chunk('c')]);
    const bm25 = assignRanks([chunk('b'), chunk('a'), chunk('d')]);
    const fused = reciprocalRankFusion(vec, bm25);
    // a + b appear in both → top of fused. c + d appear once each → bottom.
    expect(fused[0]?.id).toMatch(/^[ab]$/);
    expect(fused[1]?.id).toMatch(/^[ab]$/);
    const cdScores = fused.filter((f) => f.id === 'c' || f.id === 'd');
    const abScores = fused.filter((f) => f.id === 'a' || f.id === 'b');
    expect(Math.min(...abScores.map((s) => s.score))).toBeGreaterThan(
      Math.max(...cdScores.map((s) => s.score)),
    );
  });

  it('uses k=60 — top-rank score is 1/(60+1)', () => {
    const vec = assignRanks([chunk('a')]);
    const bm25 = assignRanks([]);
    const fused = reciprocalRankFusion(vec, bm25);
    expect(fused[0]?.score).toBeCloseTo(1 / (RRF_K + 1), 6);
  });

  it('returns sorted descending by score', () => {
    const vec = assignRanks([chunk('a'), chunk('b'), chunk('c')]);
    const bm25 = assignRanks([chunk('c'), chunk('b'), chunk('a')]);
    const fused = reciprocalRankFusion(vec, bm25);
    const scores = fused.map((f) => f.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});

describe('maximalMarginalRelevance', () => {
  function fused(id: string, vec: number[], score = 1): FusedRow {
    return { ...chunk(id, vec), score };
  }

  it('returns the input unchanged when count <= topK', () => {
    const input = [fused('a', [1, 0]), fused('b', [0, 1])];
    expect(maximalMarginalRelevance(input, [1, 0], 5).map((c) => c.id)).toEqual(
      ['a', 'b'],
    );
  });

  it('rejects near-duplicates in favor of diverse alternatives', () => {
    // q sits at 45° between two principal axes so `first` and `diverse`
    // have identical cosine relevance (≈0.707), while `duplicate` is
    // identical to `first`. With λ=0.7 the diversity penalty on
    // `duplicate` (sim=1 → -0.3) must outweigh its relevance tie, so
    // the second pick is `diverse`.
    const q = [1, 1, 0];
    const input = [
      fused('first', [1, 0, 0]),
      fused('duplicate', [1, 0, 0]),
      fused('diverse', [0, 1, 0]),
    ];
    const picked = maximalMarginalRelevance(input, q, 2);
    expect(picked.map((c) => c.id)).toEqual(['first', 'diverse']);
  });

  it('handles candidates without an embedding by treating them as zero-similarity', () => {
    const input = [
      fused('a', [1, 0]),
      { ...chunk('no-vec', null), score: 0.5 },
      fused('b', [0, 1]),
    ];
    const picked = maximalMarginalRelevance(input, [1, 0], 3);
    // All 3 should be picked since topK >= input length.
    expect(picked.map((c) => c.id).sort()).toEqual(['a', 'b', 'no-vec']);
  });
});

describe('cosine + parseVectorLiteral helpers', () => {
  it('cosine returns 1 for identical vectors, 0 for orthogonal', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1, 6);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('cosine returns 0 for any zero vector (no NaN from divide-by-zero)', () => {
    expect(cosine([0, 0], [1, 0])).toBe(0);
  });

  it('parseVectorLiteral round-trips pgvector text format', () => {
    expect(parseVectorLiteral('[0.1,0.2,-0.3]')).toEqual([0.1, 0.2, -0.3]);
    expect(parseVectorLiteral('[]')).toBe(null);
    expect(parseVectorLiteral(null)).toBe(null);
    expect(parseVectorLiteral('not-a-vector')).toBe(null);
  });
});
