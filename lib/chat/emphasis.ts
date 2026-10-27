// Markdown emphasis in the companion's answers. The model sets titles and
// stressed words in *asterisks* (or _underscores_), and sometimes **bold**;
// the panel shows them as italics and bold instead of the marks.

export type EmphasisPiece = { text: string; em?: true; strong?: true };

// Each mark must hug its text (no space just inside it), so "2 * 3 * 4" and
// "* a list item" stay as they are; underscores must also sit outside words.
const EMPHASIS = /\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*|\*(?=\S)([^*\n]+?)(?<=\S)\*|(?<!\w)_(?=\S)([^_\n]+?)(?<=\S)_(?!\w)/g;

/** Splits text into plain and emphasised runs, in order, without the marks. */
export function splitEmphasis(text: string): EmphasisPiece[] {
  const out: EmphasisPiece[] = [];
  let last = 0;
  for (const m of text.matchAll(EMPHASIS)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push(m[1] !== undefined ? { text: m[1], strong: true } : { text: m[2] ?? m[3], em: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
