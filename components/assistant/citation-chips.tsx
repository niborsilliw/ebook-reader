"use client";

import type { Citation } from "@/lib/rag/types";

/**
 * "From: <book>, <chapter>" chips under an answer. Citations from the same
 * chapter share one chip. Clicking jumps the reader to that chapter.
 */
export function CitationChips({
  citations,
  bookTitle,
  onCite,
}: {
  citations: Citation[];
  bookTitle: string;
  onCite: (spineHref: string) => void;
}) {
  const groups = new Map<string, { href: string; chapter: string | null; numbers: number[] }>();
  for (const c of citations) {
    const key = `${c.spine_href}\u0000${c.chapter_title ?? ""}`;
    const g = groups.get(key) ?? { href: c.spine_href, chapter: c.chapter_title, numbers: [] };
    g.numbers.push(c.n);
    groups.set(key, g);
  }

  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Sources">
      {[...groups.values()].map((g) => (
        <li key={`${g.href}-${g.numbers.join(",")}`}>
          <button
            type="button"
            onClick={() => onCite(g.href)}
            className="rounded-full border bg-background px-2.5 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <span className="tabular-nums">[{g.numbers.join(", ")}]</span> From: <span className="italic">{bookTitle}</span>
            {g.chapter ? `, ${g.chapter}` : ""}
          </button>
        </li>
      ))}
    </ul>
  );
}
