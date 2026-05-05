import type { HighlightRange } from '@shizuku/types';

/**
 * Range serialization for PDF.js text-layer highlights.
 *
 * The text-layer renders each text-run as a `<span>` inside a per-page
 * container. We serialize a Range by recording the indices of its start
 * and end spans + offsets within those spans, plus the selected quote
 * (for fuzzy fallback if the indices stop matching after a re-render).
 *
 * The serialization is opaque to the backend — it's stored as jsonb and
 * round-trips unchanged.
 */

export function serializeRange(range: Range, container: HTMLElement): HighlightRange | null {
  const spans = Array.from(container.querySelectorAll('span'));
  const startIdx = findContainingSpan(spans, range.startContainer);
  const endIdx = findContainingSpan(spans, range.endContainer);
  if (startIdx === -1 || endIdx === -1) return null;
  return {
    startNodeIndex: startIdx,
    startOffset: range.startOffset,
    endNodeIndex: endIdx,
    endOffset: range.endOffset,
    quote: range.toString().slice(0, 2000),
  };
}

/** Reverse — find the spans + offsets and reconstruct a Range. */
export function deserializeRange(
  serialized: HighlightRange,
  container: HTMLElement,
): Range | null {
  const spans = Array.from(container.querySelectorAll('span'));
  const startSpan = spans[serialized.startNodeIndex];
  const endSpan = spans[serialized.endNodeIndex];
  if (!startSpan || !endSpan) return fuzzyMatchByQuote(serialized.quote, container);
  const startNode = startSpan.firstChild;
  const endNode = endSpan.firstChild;
  if (!startNode || !endNode) return fuzzyMatchByQuote(serialized.quote, container);
  const range = document.createRange();
  try {
    range.setStart(startNode, Math.min(serialized.startOffset, startNode.textContent?.length ?? 0));
    range.setEnd(endNode, Math.min(serialized.endOffset, endNode.textContent?.length ?? 0));
    return range;
  } catch {
    return fuzzyMatchByQuote(serialized.quote, container);
  }
}

function findContainingSpan(spans: HTMLSpanElement[], node: Node): number {
  for (let i = 0; i < spans.length; i++) {
    if (spans[i]?.contains(node)) return i;
  }
  return -1;
}

/**
 * Last-resort fuzzy fallback: search the container's textContent for the
 * stored `quote` and build a Range over the first hit. Used when the text
 * layer has been re-rendered with different span boundaries (e.g. after
 * a zoom change or a PDF.js minor version bump).
 */
function fuzzyMatchByQuote(quote: string, container: HTMLElement): Range | null {
  if (!quote) return null;
  const text = container.textContent ?? '';
  const idx = text.indexOf(quote);
  if (idx === -1) return null;
  // Walk text nodes counting characters.
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const len = node.data.length;
    if (!startNode && consumed + len > idx) {
      startNode = node;
      startOffset = idx - consumed;
    }
    if (!endNode && consumed + len >= idx + quote.length) {
      endNode = node;
      endOffset = idx + quote.length - consumed;
      break;
    }
    consumed += len;
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}
