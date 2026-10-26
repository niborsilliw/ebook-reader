// The book's body face: Libre Baskerville, self-hosted from
// public/fonts/libre-baskerville (SIL Open Font License, see OFL.txt there).
// epub.js renders each chapter in its own iframe, which doesn't see the app's
// fonts, so the @font-face rules are added to every chapter document.

export const BODY_FONT = `"Libre Baskerville", Baskerville, "Baskerville Old Face", Georgia, serif`;

const DIR = "/fonts/libre-baskerville";
const SUBSETS = {
  latin:
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  "latin-ext":
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
};
const FACES = [
  { weight: 400, style: "normal" },
  { weight: 400, style: "italic" },
  { weight: 700, style: "normal" },
  { weight: 700, style: "italic" },
] as const;

// Chapter documents are blob/srcdoc pages, so font URLs must be absolute.
function fontFaceCss(origin: string) {
  return FACES.flatMap(({ weight, style }) =>
    Object.entries(SUBSETS).map(
      ([subset, range]) =>
        `@font-face{font-family:"Libre Baskerville";font-style:${style};font-weight:${weight};font-display:block;` +
        `src:url("${origin}${DIR}/libre-baskerville-${subset}-${weight}-${style}.woff2") format("woff2");unicode-range:${range}}`,
    ),
  ).join("\n");
}

/**
 * Adds the body face to a chapter document and waits (briefly) for it to load.
 * epub.js waits for this before measuring pages, so page breaks are laid out
 * in Baskerville rather than in a fallback face that is swapped out later,
 * which would move the text off the page it was restored to.
 */
export async function installBodyFont(doc: Document, timeoutMs = 4000) {
  const style = doc.createElement("style");
  style.textContent = fontFaceCss(window.location.origin);
  doc.head.appendChild(style);
  const loads = FACES.map(({ weight, style }) => doc.fonts.load(`${style} ${weight} 1em "Libre Baskerville"`));
  const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs));
  try {
    await Promise.race([Promise.all(loads), timeout]);
  } catch (err) {
    console.warn("[reader] couldn't load Libre Baskerville; using a fallback serif", err);
  }
}
