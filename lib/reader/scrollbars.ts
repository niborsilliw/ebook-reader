// The reader never shows a scrollbar: only epub.js's pagination moves the
// book. The scrollbars are hidden visually, never with `overflow: hidden` on
// the chapter's html/body: that clips epub.js's column layout, and every page
// after the first comes up blank. Overflow stays as it is underneath, so
// epub.js can still measure and scroll the columns.

// Written as a <style> element rather than epub.js theme rules: theme rules go
// through insertRule, which throws on a selector the browser doesn't know
// (::-webkit-scrollbar in Firefox), while a stylesheet just skips that rule.
export const HIDDEN_SCROLLBAR_CSS = `
html, body { scrollbar-width: none; -ms-overflow-style: none; }
html::-webkit-scrollbar, body::-webkit-scrollbar { display: none; width: 0; height: 0; }
`;

const STYLE_ID = "reader-hidden-scrollbars";

/** Hides the chapter's scrollbars (an epub.js content hook). */
export function hideScrollbars(doc: Document) {
  if (doc.getElementById(STYLE_ID)) return;
  const root = doc.documentElement;
  const head = doc.head ?? root.querySelector("head") ?? root;
  const style = doc.createElementNS(root.namespaceURI, "style");
  style.setAttribute("id", STYLE_ID);
  style.textContent = HIDDEN_SCROLLBAR_CSS;
  head.appendChild(style);
}
