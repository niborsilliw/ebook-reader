"use client";

import type { WebSource } from "@/lib/chat/links";
import { webBibtex, type WebPage } from "@/lib/cite/bibtex";
import { copyBib } from "@/lib/cite/copy";
import type { Citation } from "@/lib/rag/types";

const CHIP = "rounded-full border bg-background px-2.5 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground";

/**
 * "From: <book>, <chapter>" chips under an answer. Citations from the same
 * chapter share one chip. Clicking jumps the reader to that chapter. Then a
 * "From the web: <site>" chip for each web page the answer cites, which
 * opens the page in a new tab, with a "Cite" that copies it as BibTeX.
 */
export function CitationChips({
  citations,
  webSources = [],
  webPages = [],
  bookTitle,
  onCite,
}: {
  citations: Citation[];
  webSources?: WebSource[];
  /** What the searches returned about each page, to fill in the citation. */
  webPages?: WebPage[];
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
            className={CHIP}
          >
            <span className="tabular-nums">[{g.numbers.join(", ")}]</span> From: <span className="italic">{bookTitle}</span>
            {g.chapter ? `, ${g.chapter}` : ""}
          </button>
        </li>
      ))}
      {webSources.map((s) => (
        <li key={s.href} className="flex items-center gap-1">
          <a href={s.href} target="_blank" rel="noopener noreferrer" title={s.href} className={`${CHIP} inline-block`}>
            <span className="italic">[{s.mark}]</span> From the web: {s.host}
          </a>
          <button
            type="button"
            onClick={() => void copyBib(webBibtex(pageFor(s.href, webPages), new Date()))}
            aria-label={`Cite ${s.host} (BibTeX)`}
            title="Copy a BibTeX citation for this page"
            className="rounded px-1 text-xs text-muted-foreground italic underline-offset-2 hover:text-foreground hover:underline"
          >
            Cite
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The search's record of a cited page. The model may write the address a
 * little differently (www., a trailing slash, a #fragment); without a match
 * the citation has just the address.
 */
export function pageFor(href: string, pages: WebPage[]): WebPage {
  const norm = (u: string) => u.toLowerCase().replace(/#.*$/, "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
  return pages.find((p) => norm(p.url) === norm(href)) ?? { url: href };
}
