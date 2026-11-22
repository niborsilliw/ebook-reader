// Headings and titles must never be justified. Many publishers set
// `text-align: justify` on the body (or on every <p>, titles included), and a
// heading inherits it: when a short title like "Nobody Said Anything" wraps on
// a phone, its first line is stretched edge to edge with huge gaps between the
// words. Body text stays justified; only titles are put right.
//
// Where the publisher aligned a title themselves (centred, left), that choice
// stands. Only a title that comes out justified is changed, and it is centred,
// as book titles conventionally are.

export const TITLE_CLASS = "reader-title";
export const TITLE_UNJUSTIFIED_CLASS = "reader-title-centred";

const HEADING_TAGS = "h1, h2, h3, h4, h5, h6";

// Title-like elements publishers mark up as paragraphs or divs: class names
// such as "title", "chapter-title", "subtitle", "heading", "ct" (chapter
// title), "cn" (chapter number), or EPUB/ARIA semantics.
const TITLE_SELECTOR = [
  HEADING_TAGS,
  "header",
  "[class*='title' i]",
  "[class*='heading' i]",
  "[epub\\:type~='title']",
  "[epub\\:type~='subtitle']",
  "[role='heading']",
  "[role='doc-subtitle']",
].join(", ");
const SHORT_CLASS = /(^|\s)(ct|cn|ctc|cst|chap(ter)?(num|no|head)?|hd|h)(\d)?(\s|$)/i;

// A long run of text is prose, whatever its class says.
const MAX_TITLE_CHARS = 200;

/** epub.js theme rules (injected into every rendered page). */
export const TITLE_STYLES: Record<string, Record<string, string>> = {
  [`${HEADING_TAGS}, .${TITLE_CLASS}`]: {
    hyphens: "none !important",
    "-webkit-hyphens": "none !important",
  },
  [`.${TITLE_UNJUSTIFIED_CLASS}`]: {
    "text-align": "center !important",
    "text-align-last": "center !important",
  },
};

const isJustified = (v: string | undefined) => !!v && v.startsWith("justify");

/**
 * Marks the chapter's titles, and centres any that would otherwise be
 * justified (by their own rule or one inherited from the body). Call once
 * the book's stylesheets have loaded. Returns the titles it centred.
 */
export function markTitles(doc: Document): Element[] {
  const body = doc.body;
  const view = doc.defaultView;
  if (!body || !view) return [];

  const candidates = new Set<Element>(body.querySelectorAll(TITLE_SELECTOR));
  for (const el of body.querySelectorAll("[class]")) if (SHORT_CLASS.test(el.getAttribute("class") ?? "")) candidates.add(el);

  const centred: Element[] = [];
  for (const el of candidates) {
    if (el === body || (el.textContent ?? "").trim().length > MAX_TITLE_CHARS) continue;
    el.classList.add(TITLE_CLASS);
    const style = view.getComputedStyle(el);
    // text-align-last: justify stretches even a one-line title.
    if (isJustified(style.textAlign) || isJustified(style.textAlignLast)) {
      el.classList.add(TITLE_UNJUSTIFIED_CLASS);
      centred.push(el);
    }
  }
  return centred;
}
