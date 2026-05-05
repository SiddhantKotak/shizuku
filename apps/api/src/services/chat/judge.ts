import {
  PET_FLAVORS,
  judgeReportSchema,
  type JudgeReport,
  type JudgeVerdict,
  type PetSpecies,
} from '@shizuku/types';
import { getOpenAIClient } from '../ai/openai.js';
import type { RankedChunk } from '../documents/search.js';

/**
 * Post-stream LLM-as-judge.
 *
 * Runs AFTER the main chat stream closes (fired via `setImmediate` in the
 * route so it never blocks the SSE response). Scores the assistant's reply
 * on four axes and writes the verdict back to `chat_messages`:
 *
 *   - cites_pages   — does the response cite source pages with [p.X]?
 *   - in_character  — does it match the species voice?
 *   - grounded      — every claim traces to a retrieved chunk; no fabrication?
 *   - helpful       — does it actually answer the question?
 *
 * Each axis is 0-2; total 0-8. Threshold for `needs_refinement`:
 * total < 5 OR grounded < 1 (grounding is the most important axis — a
 * fabricated answer is worse than a clipped one).
 *
 * Cost: ~$0.0007 per call at gpt-4o-mini pricing (300 input + 100 output
 * tokens typical). 7% bump on a chat budget.
 */

const JUDGE_MODEL = 'gpt-4o-mini';
const JUDGE_TEMPERATURE = 0.0;
const JUDGE_MAX_TOKENS = 300;

const NEEDS_REFINEMENT_TOTAL_THRESHOLD = 5;

export interface JudgeArgs {
  species: PetSpecies;
  /** The user's question. */
  query: string;
  /** The assistant's full streamed reply. */
  response: string;
  /** Same chunks fed into the generation step. */
  chunks: RankedChunk[];
}

/**
 * Run the judge once and return a `JudgeReport`. Throws on transport/parse
 * failure — the caller (chat route) catches and persists `null` verdict so
 * the message still renders, just without a [Refine] affordance.
 */
export async function judgeChatResponse(args: JudgeArgs): Promise<JudgeReport> {
  const client = getOpenAIClient();
  const flavor = PET_FLAVORS[args.species];
  const chunkSummaries = args.chunks
    .map((c, i) => `[Chunk ${i + 1}, p.${c.pageStart}-${c.pageEnd}]: ${truncate(c.content, 280)}`)
    .join('\n');

  const systemPrompt = [
    "You are an evaluator for a study app's pet-companion chat responses.",
    `The pet is ${flavor.displayName} — ${flavor.flavor}`,
    'Your job: rate the response on four axes (0-2 each). Output ONLY the JSON object described below — no prose, no markdown fences.',
    '',
    'Axes:',
    '  cites_pages (0-2): 0 = no [p.X] citations; 1 = some claims cited; 2 = every factual claim has a [p.X].',
    '  in_character (0-2): 0 = generic AI tone; 1 = some character; 2 = clearly in voice.',
    '  grounded (0-2): 0 = invented facts not in chunks; 1 = mostly grounded with minor drift; 2 = every claim verifiable from chunks.',
    '  helpful (0-2): 0 = does not address the question; 1 = partial; 2 = directly answers.',
    '',
    'Output format: { "scores": { "citesPages": int, "inCharacter": int, "grounded": int, "helpful": int }, "total": int, "issues": [string,...], "verdict": "approved" | "needs_refinement" }',
    '',
    'Set verdict="needs_refinement" if total < 5 OR grounded < 1. `issues` is a short list of concrete problems (max 5, each <120 chars).',
  ].join('\n');

  const userPrompt = [
    `Query: ${args.query}`,
    '',
    `Retrieved chunks:`,
    chunkSummaries || '(no chunks)',
    '',
    `Pet response: ${args.response}`,
  ].join('\n');

  const completion = await client.chat.completions.create({
    model: JUDGE_MODEL,
    temperature: JUDGE_TEMPERATURE,
    max_tokens: JUDGE_MAX_TOKENS,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('judge_returned_empty');
  const parsed = JSON.parse(raw) as unknown;
  const result = judgeReportSchema.safeParse(parsed);
  if (!result.success) {
    // Recover by re-deriving the verdict from whatever scores we did get.
    // Cheaper than asking again, and a malformed judge response usually
    // still has the four numeric scores.
    return reconcileMalformedJudgeOutput(parsed);
  }
  // Override the model's verdict with our deterministic threshold so a
  // confused judge can't flip a bad-graded response to "approved".
  const total =
    result.data.scores.citesPages +
    result.data.scores.inCharacter +
    result.data.scores.grounded +
    result.data.scores.helpful;
  return {
    ...result.data,
    total,
    verdict: deriveVerdict(result.data.scores, total),
  };
}

function deriveVerdict(
  scores: JudgeReport['scores'],
  total: number,
): JudgeVerdict {
  if (scores.grounded < 1) return 'needs_refinement';
  if (total < NEEDS_REFINEMENT_TOTAL_THRESHOLD) return 'needs_refinement';
  return 'approved';
}

/**
 * Best-effort recovery from a judge response that didn't match our schema.
 * If the model returned scores in the right shape but a missing or invalid
 * verdict, we re-derive everything from the numbers.
 */
function reconcileMalformedJudgeOutput(parsed: unknown): JudgeReport {
  const fallback: JudgeReport = {
    scores: { citesPages: 0, inCharacter: 0, grounded: 0, helpful: 0 },
    total: 0,
    issues: ['judge_output_malformed'],
    verdict: 'needs_refinement',
  };
  if (!parsed || typeof parsed !== 'object') return fallback;
  const obj = parsed as Record<string, unknown>;
  const rawScores = obj['scores'];
  if (!rawScores || typeof rawScores !== 'object') return fallback;
  const s = rawScores as Record<string, unknown>;
  const num = (key: string): number => {
    const v = s[key];
    return typeof v === 'number' && v >= 0 && v <= 2 ? Math.round(v) : 0;
  };
  const scores = {
    citesPages: num('citesPages'),
    inCharacter: num('inCharacter'),
    grounded: num('grounded'),
    helpful: num('helpful'),
  };
  const total = scores.citesPages + scores.inCharacter + scores.grounded + scores.helpful;
  const issuesRaw = obj['issues'];
  const issues =
    Array.isArray(issuesRaw) && issuesRaw.every((x) => typeof x === 'string')
      ? (issuesRaw as string[]).slice(0, 5)
      : [];
  return { scores, total, issues, verdict: deriveVerdict(scores, total) };
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
