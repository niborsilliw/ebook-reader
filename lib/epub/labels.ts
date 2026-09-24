import type { TocEntry } from "./parse";

// A numbered major division: "Part II", "Book 3", "Chapter One", "PART V:".
const DIVISION = /^(part|book|volume|chapter)\s+\S+/i;
// Just the number, with the real title in the next TOC entry: "Part II" + "On the Mind".
const BARE_DIVISION = /^(part|book|volume|chapter)\s+([ivxlcdm]+|\d+|[a-z]+)$/i;
const ROMAN = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "the", "to", "with"]);

export type LabelState = { division: string | null; section: string | null };
export const EMPTY_LABEL: LabelState = { division: null, section: null };

/** "PART I. CONCERNING GOD." -> "Part I. Concerning God"; mixed-case titles keep their casing. */
export function cleanTitle(title: string): string {
  const t = title.replace(/\s+/g, " ").trim().replace(/[\s.:;,]+$/, "");
  return /\p{L}/u.test(t) && t === t.toUpperCase() ? titleCase(t) : t;
}

function titleCase(upper: string) {
  const words = upper.split(" ");
  return words
    .map((word, i) => {
      const prev = words[i - 1] ?? "";
      const bare = word.replace(/[^\p{L}]/gu, "");
      if (ROMAN.test(bare) && bare && /^(part|book|volume|chapter|section)$/i.test(prev.replace(/[^\p{L}]/gu, ""))) {
        return word;
      }
      const lower = word.toLowerCase();
      const startsPhrase = i === 0 || /[:.]$/.test(prev);
      if (!startsPhrase && SMALL_WORDS.has(lower)) return lower;
      return lower.replace(/\p{L}/u, (c) => c.toUpperCase());
    })
    .join(" ");
}

/**
 * Updates the running label with the TOC entries that start a segment.
 * The last division-like entry (top TOC level, or "Part/Book/Chapter N")
 * becomes the division; a following entry is the section inside it.
 */
export function applyHeadings(state: LabelState, heads: TocEntry[], topLevel: number): LabelState {
  if (heads.length === 0) return state;
  const titles = heads.map((h) => cleanTitle(h.title));
  let d = -1;
  heads.forEach((h, i) => {
    if (h.level === topLevel || DIVISION.test(titles[i])) d = i;
  });
  if (d === -1) return { division: state.division, section: titles[titles.length - 1] };

  let division = titles[d];
  let next = d + 1;
  if (BARE_DIVISION.test(titles[d]) && next < titles.length) {
    division = `${titles[d]}: ${titles[next]}`;
    next++;
  }
  return { division, section: next < titles.length ? titles[titles.length - 1] : null };
}

export function labelOf(state: LabelState): string | null {
  const { division, section } = state;
  if (division && section) return `${division} › ${section}`;
  return division ?? section;
}

/** True if a segment is only its heading(s): nothing worth indexing on its own. */
export function isHeadingOnly(text: string, heads: TocEntry[]): boolean {
  let rest = text.toLowerCase();
  for (const h of heads) rest = rest.split(h.title.replace(/\s+/g, " ").trim().toLowerCase()).join(" ");
  return rest.replace(/[\s\p{P}\p{S}]+/gu, "").length <= 2;
}

const PG_START = /^.*\*{3}\s*START OF (THE|THIS) PROJECT GUTENBERG.*$/im;
const PG_END = /^.*\*{3}\s*END OF (THE|THIS) PROJECT GUTENBERG.*$/im;

/**
 * Removes Project Gutenberg's header (everything up to the "*** START OF"
 * line) and footer (from the "*** END OF" line) when they fall inside a
 * section, keeping the book text around them.
 */
export function stripGutenberg(text: string): string {
  let t = text;
  const start = t.match(PG_START);
  if (start?.index !== undefined) t = t.slice(start.index + start[0].length);
  const end = t.match(PG_END);
  if (end?.index !== undefined) t = t.slice(0, end.index);
  return t.trim();
}

/** Sections to leave out of the index: Project Gutenberg's license. */
export function isBoilerplate(label: string | null): boolean {
  return Boolean(label && /project gutenberg/i.test(label) && /licen[cs]e/i.test(label));
}
