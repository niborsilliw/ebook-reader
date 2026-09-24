import type { Source } from "./types";

export const MATCH_CANDIDATES = 12;
export const MAX_SOURCES = 8;
// Small nudge for passages in the chapter the reader is looking at:
// "what does this chapter say about…" is a common question.
export const CURRENT_CHAPTER_BOOST = 0.03;
const FOLLOW_UP_MAX_WORDS = 8;

export type MatchRow = {
  id: number;
  chunk_index: number;
  spine_href: string;
  chapter_title: string | null;
  content: string;
  similarity: number;
};

export type RetrievalDeps = {
  /** Embeds one query with mistral-embed. */
  embedQuery: (text: string) => Promise<number[]>;
  /** match_chunks(book_id, embedding, k) — RLS-scoped to the caller. */
  matchChunks: (bookId: string, embedding: number[], k: number) => Promise<MatchRow[]>;
};

/**
 * Text to embed for a question. Short follow-ups ("why?", "and in part 3?")
 * carry little meaning alone, so the previous question is prepended.
 */
export function buildRetrievalQuery(question: string, previousQuestion?: string | null): string {
  const q = question.trim();
  const words = q.split(/\s+/).filter(Boolean).length;
  return previousQuestion && words <= FOLLOW_UP_MAX_WORDS ? `${previousQuestion.trim()}\n${q}` : q;
}

export async function retrieveSources(
  deps: RetrievalDeps,
  args: { bookId: string; query: string; currentHref?: string | null },
): Promise<Source[]> {
  const embedding = await deps.embedQuery(args.query);
  const rows = await deps.matchChunks(args.bookId, embedding, MATCH_CANDIDATES);
  const current = args.currentHref?.split("#")[0];

  return rows
    // Chunk hrefs may carry a #section anchor; the boost is per file.
    .map((r) => ({
      row: r,
      score: r.similarity + (current && r.spine_href.split("#")[0] === current ? CURRENT_CHAPTER_BOOST : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SOURCES)
    .map(({ row }, i) => ({
      n: i + 1,
      chunk_id: row.id,
      chunk_index: row.chunk_index,
      chapter_title: row.chapter_title,
      spine_href: row.spine_href,
      content: row.content,
      similarity: row.similarity,
    }));
}
