// Pages that are just one picture (covers, plates, frontispieces) are often
// written to fill the page: an <svg width="100%" height="100%"> wrapping an
// <image>, or an <img> sized to the viewport. In the reader they should sit
// centred at a comfortable size instead of bleeding edge to edge.

export const IMAGE_PAGE_CLASS = "reader-image-page";
export const IMAGE_PAGE_FIGURE_CLASS = "reader-image-page-figure";

// Short captions ("Frontispiece", "Cover") still count as an image page.
const MAX_CAPTION_CHARS = 40;

/** epub.js theme rules (injected into every rendered page). */
export const IMAGE_PAGE_STYLES: Record<string, Record<string, string>> = {
  [`.${IMAGE_PAGE_CLASS}`]: { "text-align": "center !important" },
  [`.${IMAGE_PAGE_FIGURE_CLASS}`]: {
    display: "block !important",
    width: "60% !important",
    "max-width": "60% !important",
    height: "auto !important",
    "max-height": "90vh !important",
    margin: "5vh auto 0 !important",
    "object-fit": "contain",
  },
};

/**
 * Marks the page if its body is a single image and (almost) no text.
 * Returns the marked element, or null if this isn't an image page.
 */
export function markImagePage(doc: Document): Element | null {
  const body = doc.body;
  if (!body) return null;

  // Top-level pictures only: an <svg> counts once, not its inner <image>.
  const figures = [...body.querySelectorAll("img, svg")].filter((el) => !el.parentElement?.closest("svg"));
  if (figures.length !== 1) return null;

  const figure = figures[0];
  if (figure.tagName.toLowerCase() === "svg" && !figure.querySelector("image, img")) return null; // decorative svg

  const text = (body.textContent ?? "").replace(/\s+/g, "");
  if (text.length > MAX_CAPTION_CHARS) return null;

  body.classList.add(IMAGE_PAGE_CLASS);
  figure.classList.add(IMAGE_PAGE_FIGURE_CLASS);
  return figure;
}
