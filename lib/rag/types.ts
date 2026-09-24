/** A retrieved excerpt, numbered as the model sees it ([n]). */
export type Source = {
  n: number;
  chunk_id: number;
  chunk_index: number;
  chapter_title: string | null;
  spine_href: string;
  content: string;
  similarity: number;
};

/** What the UI and messages.citations keep about a cited source. */
export type Citation = Pick<Source, "n" | "chunk_id" | "chapter_title" | "spine_href">;

export const toCitation = ({ n, chunk_id, chapter_title, spine_href }: Source): Citation => ({
  n,
  chunk_id,
  chapter_title,
  spine_href,
});
