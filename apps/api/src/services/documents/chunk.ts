import { countTokens, tailTokens } from '../../lib/tokenizer.js';

/** A single page of extracted text from a PDF. */
export interface PageText {
  pageNumber: number;
  text: string;
}

/** A chunk produced by the splitter, ready to be embedded. */
export interface TextChunk {
  pageStart: number;
  pageEnd: number;
  chunkIndex: number;
  content: string;
  tokenCount: number;
}

export const CHUNK_TARGET_TOKENS = 500;
export const CHUNK_OVERLAP_TOKENS = 50;
export const MIN_CHUNK_TOKENS = 40;

/**
 * Split PDF page text into 500-token chunks with 50-token overlap.
 *
 * Algorithm:
 *   1. For each page, split text on paragraph breaks (blank lines).
 *   2. Greedily pack paragraphs into the current chunk until adding the next
 *      would exceed CHUNK_TARGET_TOKENS.
 *   3. If a single paragraph alone is larger than the target, fall back to
 *      sentence-level splitting via Intl.Segmenter('en', granularity:'sentence').
 *   4. After emitting each chunk, the trailing CHUNK_OVERLAP_TOKENS tokens
 *      are carried into the next chunk so retrieval doesn't miss content
 *      that straddles a chunk boundary.
 *   5. Chunks shorter than MIN_CHUNK_TOKENS are dropped — they're typically
 *      blank pages, page numbers, or running headers and would just be noise
 *      in the vector index.
 *
 * The paragraph-first strategy keeps semantically related text together;
 * sentence fallback only kicks in for monolithic walls of text.
 */
export function chunkPages(pages: ReadonlyArray<PageText>): TextChunk[] {
  const chunks: TextChunk[] = [];
  let buffer = '';
  let bufferStartPage = pages[0]?.pageNumber ?? 1;
  let bufferEndPage = bufferStartPage;
  let chunkIndex = 0;

  const flush = (): void => {
    const trimmed = buffer.trim();
    if (!trimmed) {
      buffer = '';
      return;
    }
    const tokens = countTokens(trimmed);
    if (tokens >= MIN_CHUNK_TOKENS) {
      chunks.push({
        pageStart: bufferStartPage,
        pageEnd: bufferEndPage,
        chunkIndex: chunkIndex++,
        content: trimmed,
        tokenCount: tokens,
      });
    }
    // Carry overlap into the next chunk
    const carry = tailTokens(trimmed, CHUNK_OVERLAP_TOKENS).trim();
    buffer = carry;
    bufferStartPage = bufferEndPage;
  };

  for (const page of pages) {
    const paragraphs = splitParagraphs(page.text);
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;
      const paraTokens = countTokens(trimmed);

      // Single paragraph is bigger than the target — fall back to sentences.
      if (paraTokens > CHUNK_TARGET_TOKENS) {
        if (buffer.trim()) {
          bufferEndPage = page.pageNumber;
          flush();
        }
        for (const sentence of splitSentences(trimmed)) {
          const candidate = buffer ? `${buffer} ${sentence}` : sentence;
          const candidateTokens = countTokens(candidate);
          if (candidateTokens > CHUNK_TARGET_TOKENS && buffer.trim()) {
            bufferEndPage = page.pageNumber;
            flush();
            buffer = buffer ? `${buffer} ${sentence}` : sentence;
          } else {
            buffer = candidate;
          }
        }
        bufferEndPage = page.pageNumber;
        continue;
      }

      // Normal path: try to add this paragraph to the buffer.
      const candidate = buffer ? `${buffer}\n\n${trimmed}` : trimmed;
      const candidateTokens = countTokens(candidate);
      if (candidateTokens > CHUNK_TARGET_TOKENS) {
        bufferEndPage = page.pageNumber;
        flush();
        buffer = buffer ? `${buffer}\n\n${trimmed}` : trimmed;
      } else {
        buffer = candidate;
      }
      bufferEndPage = page.pageNumber;
    }
  }

  // Tail: emit whatever's left in the buffer.
  if (buffer.trim()) flush();

  return chunks;
}

/** Split on one or more blank lines. */
function splitParagraphs(text: string): string[] {
  return text.split(/\n{2,}/).map((p) => p.replace(/\s+/g, ' ').trim());
}

/**
 * Sentence segmentation via Intl.Segmenter — handles common locale rules
 * (abbreviations, ellipses, decimals) better than a regex would. Falls
 * back to a regex on runtimes without Intl.Segmenter (very old Node, but
 * we're on Node 22).
 */
function splitSentences(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter('en', { granularity: 'sentence' });
    return Array.from(seg.segment(text), (s) => s.segment.trim()).filter(Boolean);
  }
  return text.split(/(?<=[.?!])\s+/).filter(Boolean);
}
