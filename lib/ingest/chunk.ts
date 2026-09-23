import type { ParsedEpub } from "@/lib/epub/parse";

export const CHUNK_TOKENS = 500;
export const OVERLAP_TOKENS = 50;
// Mistral's tokenizer averages roughly 4 characters per token on English prose.
// Chunk sizing only needs to be approximate: mistral-embed accepts far more.
export const CHARS_PER_TOKEN = 4;

export const estimateTokens = (text: string) => Math.ceil(text.length / CHARS_PER_TOKEN);

export type ChunkRow = {
  chunk_index: number;
  spine_index: number;
  spine_href: string;
  chapter_title: string | null;
  content: string;
  token_count: number;
};

type Options = { maxTokens?: number; overlapTokens?: number };

/** Chunk a whole book. Chunks never span two spine files, so each has one chapter. */
export function chunkBook(book: Pick<ParsedEpub, "sections">, opts: Options = {}): ChunkRow[] {
  const rows: ChunkRow[] = [];
  for (const section of book.sections) {
    for (const content of chunkText(section.text, opts)) {
      rows.push({
        chunk_index: rows.length,
        spine_index: section.spineIndex,
        spine_href: section.href,
        chapter_title: section.chapterTitle,
        content,
        token_count: estimateTokens(content),
      });
    }
  }
  return rows;
}

/**
 * Greedy paragraph packing up to maxTokens, each chunk after the first
 * starting with ~overlapTokens of the previous chunk's tail. Paragraphs that
 * can't fit are split on sentences, then on words.
 */
export function chunkText(text: string, opts: Options = {}): string[] {
  const maxTokens = opts.maxTokens ?? CHUNK_TOKENS;
  const overlapTokens = opts.overlapTokens ?? OVERLAP_TOKENS;
  // A unit must fit alongside the overlap carried into a fresh chunk, plus
  // the separator between them.
  const unitMax = maxTokens - overlapTokens - 1;

  const units = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => splitToFit(p, unitMax));

  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;
  let hasNewContent = false;

  for (const unit of units) {
    const unitTokens = estimateTokens(unit);
    // +1 approximates the paragraph separator.
    if (current.length && currentTokens + 1 + unitTokens > maxTokens) {
      const chunk = current.join("\n\n");
      chunks.push(chunk);
      const overlap = tail(chunk, overlapTokens);
      current = overlap ? [overlap] : [];
      currentTokens = overlap ? estimateTokens(overlap) : 0;
      hasNewContent = false;
    }
    current.push(unit);
    currentTokens += (current.length > 1 ? 1 : 0) + unitTokens;
    hasNewContent = true;
  }
  if (current.length && hasNewContent) chunks.push(current.join("\n\n"));
  return chunks;
}

function splitToFit(paragraph: string, maxTokens: number): string[] {
  if (estimateTokens(paragraph) <= maxTokens) return [paragraph];
  const sentences = paragraph.match(/[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)\s*/g) ?? [paragraph];
  const out: string[] = [];
  let buf = "";
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (estimateTokens(sentence) > maxTokens) {
      if (buf) {
        out.push(buf);
        buf = "";
      }
      out.push(...splitWords(sentence, maxTokens));
      continue;
    }
    const joined = buf ? `${buf} ${sentence}` : sentence;
    if (estimateTokens(joined) > maxTokens) {
      out.push(buf);
      buf = sentence;
    } else {
      buf = joined;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function splitWords(text: string, maxTokens: number): string[] {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const out: string[] = [];
  let buf = "";
  for (const word of text.split(/\s+/)) {
    // A single "word" longer than the limit (URLs, CJK runs) is cut hard.
    for (let w = word; w; w = w.slice(maxChars)) {
      const piece = w.slice(0, maxChars);
      const joined = buf ? `${buf} ${piece}` : piece;
      if (joined.length > maxChars) {
        out.push(buf);
        buf = piece;
      } else {
        buf = joined;
      }
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** Last ~tokens of text, starting on a word boundary. */
function tail(text: string, tokens: number): string {
  if (tokens <= 0) return "";
  const maxChars = tokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;
  const slice = text.slice(-maxChars);
  const firstSpace = slice.search(/\s/);
  return (firstSpace === -1 ? slice : slice.slice(firstSpace)).trim();
}

/** Text sent to mistral-embed: a short locating header helps short chunks retrieve. */
export function embeddingInput(chunk: Pick<ChunkRow, "content" | "chapter_title">, bookTitle: string | null) {
  const header = [bookTitle, chunk.chapter_title].filter(Boolean).join(" — ");
  return header ? `${header}\n\n${chunk.content}` : chunk.content;
}
