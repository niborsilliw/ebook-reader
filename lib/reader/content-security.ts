// Book files are untrusted: an EPUB can carry scripts. epub.js renders each
// chapter in an iframe sandboxed "allow-same-origin", which on its own would
// stop them, but Safari (WebKit) then also refuses to run the reader's own
// event listeners on the chapter document: swipes, text selection for
// highlights and keys inside the page all go dead on iPhone and iPad. So the
// iframe is allowed to run scripts, and every chapter is locked down here
// before it is rendered, so that the book's own scripts still never run:
//
// 1. A Content Security Policy, as the first element of <head> (it governs
//    everything after it), that forbids all script: <script>, inline event
//    handlers, javascript: URLs, and plugins. Frames nested in the chapter
//    inherit it.
// 2. As a second layer, the script vectors themselves are removed.
//
// The reader's listeners are attached from the app, not by script in the
// chapter, so the policy doesn't affect them.

export const CHAPTER_CSP = "script-src 'none'; object-src 'none'; base-uri 'none'";

const URL_ATTRIBUTES = ["href", "src", "action", "formaction", "data", "xlink:href"];

/** Locks a chapter document down before epub.js renders it (a book.spine content hook). */
export function lockDownChapter(doc: Document) {
  const root = doc.documentElement;
  let head: Element | null = doc.head ?? root.querySelector("head");
  if (!head) {
    head = doc.createElementNS(root.namespaceURI, "head");
    root.insertBefore(head, root.firstChild);
  }
  const csp = doc.createElementNS(root.namespaceURI, "meta");
  csp.setAttribute("http-equiv", "Content-Security-Policy");
  csp.setAttribute("content", CHAPTER_CSP);
  head.insertBefore(csp, head.firstChild);

  for (const el of Array.from(root.querySelectorAll("script, object, embed, applet"))) el.remove();
  for (const meta of Array.from(root.querySelectorAll("meta"))) {
    if (meta.getAttribute("http-equiv")?.toLowerCase() === "refresh") meta.remove();
  }
  for (const el of Array.from(root.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const isHandler = name.startsWith("on");
      const isScriptUrl = URL_ATTRIBUTES.includes(name) && /^\s*(javascript|vbscript):/i.test(attr.value);
      if (isHandler || isScriptUrl || (name === "srcdoc" && el.localName === "iframe")) el.removeAttribute(attr.name);
    }
  }
}
