// Tap (or click) to select: one tap selects the word under the finger, a
// second the sentence around it, a third the whole paragraph. Word and
// sentence boundaries come from Intl.Segmenter in the book's language, so
// apostrophes, hyphens and abbreviations ("Mr. Smith") break where a reader
// would expect.

export type TapUnit = "word" | "sentence" | "paragraph";

export const TAP_UNITS: TapUnit[] = ["word", "sentence", "paragraph"];

// How far outside a word's box a tap still counts as on it.
const HIT_SLOP_PX = 3;

/**
 * The range of `unit` around the text at (x, y), in the document's viewport
 * coordinates; null if the point isn't on a word (a margin, the gap between
 * paragraphs, a picture).
 */
export function rangeAtPoint(doc: Document, x: number, y: number, unit: TapUnit, lang?: string): Range | null {
  const caret = caretAt(doc, x, y);
  if (!caret || caret.node.nodeType !== Node.TEXT_NODE) return null;
  const block = blockOf(caret.node, doc);
  if (!block) return null;
  const text = textMap(block);
  const offset = text.offsetOf(caret.node as Text, caret.offset);
  if (offset < 0) return null;

  // The word must actually be under the point: the browser places a caret at
  // the nearest text even for a tap in the margin.
  const word = segmentAt(text.value, offset, "word", lang, (s) => s.isWordLike === true);
  if (!word || !hits(text.range(word.start, word.end), x, y)) return null;
  if (unit === "word") return text.range(word.start, word.end);
  if (unit === "sentence") {
    const sentence = segmentAt(text.value, word.start, "sentence", lang);
    return sentence && text.range(...trimmed(text.value, sentence.start, sentence.end));
  }
  return text.range(...trimmed(text.value, 0, text.value.length));
}

/** Replaces the document's selection with `range`. */
export function selectRange(doc: Document, range: Range) {
  const selection = doc.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

function caretAt(doc: Document, x: number, y: number): { node: Node; offset: number } | null {
  const d = doc as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y);
    return p && { node: p.offsetNode, offset: p.offset };
  }
  const r = d.caretRangeFromPoint?.(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
}

/** The nearest block-level ancestor (a paragraph, list item, heading…). */
function blockOf(node: Node, doc: Document): Element | null {
  const view = doc.defaultView;
  for (let el = node.parentElement; el && el !== doc.body; el = el.parentElement) {
    const display = view?.getComputedStyle(el).display ?? "block";
    if (!display.startsWith("inline") && display !== "contents") return el;
  }
  return doc.body;
}

/** A block's text as one string, with a way back from string offsets to DOM positions. */
function textMap(block: Element) {
  const doc = block.ownerDocument;
  const nodes: { node: Text; start: number }[] = [];
  let value = "";
  const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    nodes.push({ node: n, start: value.length });
    value += n.data;
  }
  const at = (offset: number, isEnd: boolean) => {
    // At a boundary between two nodes, a start belongs to the later node and an
    // end to the earlier one, so the range doesn't reach into a neighbour.
    for (let i = 0; i < nodes.length; i++) {
      const { node, start } = nodes[i];
      const end = start + node.data.length;
      if (isEnd ? offset <= end : offset < end) return { node, offset: offset - start };
    }
    const last = nodes[nodes.length - 1];
    return { node: last.node, offset: last.node.data.length };
  };
  return {
    value,
    offsetOf: (node: Text, offset: number) => {
      const entry = nodes.find((e) => e.node === node);
      return entry ? entry.start + offset : -1;
    },
    range: (start: number, end: number) => {
      const r = doc.createRange();
      const a = at(start, false);
      const b = at(end, true);
      r.setStart(a.node, a.offset);
      r.setEnd(b.node, b.offset);
      return r;
    },
  };
}

type Segment = { start: number; end: number };

/** The segment containing `offset` (or, at a boundary, the one ending there) that passes `accept`. */
function segmentAt(
  value: string,
  offset: number,
  granularity: "word" | "sentence",
  lang: string | undefined,
  accept: (s: Intl.SegmentData) => boolean = () => true,
): Segment | null {
  let segmenter: Intl.Segmenter;
  try {
    segmenter = new Intl.Segmenter(lang || undefined, { granularity });
  } catch {
    segmenter = new Intl.Segmenter(undefined, { granularity }); // a malformed language tag in the book
  }
  let before: Segment | null = null;
  for (const s of segmenter.segment(value)) {
    const seg = { start: s.index, end: s.index + s.segment.length };
    if (seg.start > offset) break;
    if (!accept(s)) continue;
    if (offset < seg.end) return seg;
    if (offset === seg.end) before = seg;
  }
  return before;
}

/** [start, end) with surrounding whitespace dropped. */
function trimmed(value: string, start: number, end: number): [number, number] {
  while (start < end && /\s/.test(value[start])) start++;
  while (end > start && /\s/.test(value[end - 1])) end--;
  return [start, end];
}

function hits(range: Range, x: number, y: number) {
  return Array.from(range.getClientRects()).some(
    (r) => x >= r.left - HIT_SLOP_PX && x <= r.right + HIT_SLOP_PX && y >= r.top - HIT_SLOP_PX && y <= r.bottom + HIT_SLOP_PX,
  );
}
