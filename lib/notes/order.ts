// Reading order for CFIs without loading epub.js (which needs `window`).
// Good enough to sort points and ranges within one book: compares the step
// path numerically, then the character offset. Id assertions are ignored.

/** "epubcfi(/6/4!/4/2[x],/118/1:0,/118/1:40)" → "/6/4!/4/2[x]/118/1:0" (a range's start). */
export function cfiStart(cfi: string): string {
  const inner = cfi.replace(/^epubcfi\(/, "").replace(/\)$/, "");
  const [base, start = ""] = inner.split(",");
  return base + start;
}

function sortKey(cfi: string): number[] {
  const [path, offset] = cfiStart(cfi).replace(/\[[^\]]*\]/g, "").split(":");
  const steps = path.split(/[/!]/).filter(Boolean).map(Number);
  return [...steps, offset === undefined ? -1 : Number(offset)];
}

export function compareCfi(a: string, b: string): number {
  const ka = sortKey(a);
  const kb = sortKey(b);
  for (let i = 0; i < Math.min(ka.length, kb.length); i++) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i];
  }
  return ka.length - kb.length;
}

export const UNTITLED_CHAPTER = "Untitled section";

/** Groups items by chapter, chapters and items in reading order. */
export function groupByChapter<T extends { cfi_range: string; chapter_title: string | null }>(items: T[]) {
  const groups: { chapter: string; items: T[] }[] = [];
  for (const item of [...items].sort((a, b) => compareCfi(a.cfi_range, b.cfi_range))) {
    const chapter = item.chapter_title || UNTITLED_CHAPTER;
    const last = groups.at(-1);
    if (last?.chapter === chapter) last.items.push(item);
    else groups.push({ chapter, items: [item] });
  }
  return groups;
}
