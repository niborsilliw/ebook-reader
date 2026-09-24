import { parse, NodeType, type HTMLElement, type Node } from "node-html-parser";

const SKIP = new Set(["script", "style", "head", "title", "svg", "math", "noscript", "template"]);
const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "body", "dd", "div", "dl", "dt", "figcaption",
  "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav",
  "ol", "p", "pre", "section", "table", "tr", "ul",
]);
const CELL = new Set(["td", "th"]);
// HTML void elements; every other element written as <x/> in XHTML is an empty element.
const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);

/**
 * XHTML allows <pre/>, <a id="x"/>, <div/>; an HTML parser reads those as
 * open tags (and <pre> as raw text up to a </pre> that never comes).
 * Expand them to <x></x>.
 */
export function expandSelfClosing(xhtml: string): string {
  return xhtml.replace(/<([a-zA-Z][\w:.-]*)(\s[^<>]*?)?\s*\/>/g, (whole, tag: string, attrs = "") =>
    VOID.has(tag.toLowerCase().replace(/^.*:/, "")) ? whole : `<${tag}${attrs}></${tag}>`,
  );
}

export type TextSegment = {
  /** The anchor id this segment starts at; null for text before the first anchor. */
  anchor: string | null;
  text: string;
};

type Mark = { anchor: string };

/**
 * XHTML -> plain text, split wherever an element carries one of `anchors` as
 * its id (or <a name>). One paragraph per block element, paragraphs separated
 * by a blank line, entities decoded. Always returns at least one segment.
 */
export function htmlToSegments(html: string, anchors: ReadonlySet<string> = new Set()): TextSegment[] {
  const root = parse(expandSelfClosing(html), { comment: false, blockTextElements: { pre: true } });
  const body = root.querySelector("body") ?? root;
  const out: (string | Mark)[] = [];
  walk(body, out, anchors);

  const segments: TextSegment[] = [{ anchor: null, text: "" }];
  let buf: string[] = [];
  for (const piece of out) {
    if (typeof piece === "string") {
      buf.push(piece);
    } else {
      segments[segments.length - 1].text = normalize(buf.join(""));
      segments.push({ anchor: piece.anchor, text: "" });
      buf = [];
    }
  }
  segments[segments.length - 1].text = normalize(buf.join(""));
  return segments;
}

/** Whole document as text (no splitting). */
export function htmlToText(html: string): string {
  return htmlToSegments(html)[0].text;
}

function normalize(raw: string) {
  return raw
    .split(/\n{2,}/)
    .map((para) => para.replace(/[ \t\f\v ]+/g, " ").replace(/ *\n */g, "\n").trim())
    .filter(Boolean)
    .join("\n\n");
}

function walk(node: Node, out: (string | Mark)[], anchors: ReadonlySet<string>) {
  if (node.nodeType === NodeType.TEXT_NODE) {
    // Source newlines are formatting, not line breaks.
    out.push(node.text.replace(/\s+/g, " "));
    return;
  }
  if (node.nodeType !== NodeType.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.rawTagName?.toLowerCase().replace(/^.*:/, "") ?? "";
  if (SKIP.has(tag)) return;

  if (anchors.size) {
    const id = el.getAttribute("id") ?? (tag === "a" ? el.getAttribute("name") : undefined);
    if (id && anchors.has(id)) out.push({ anchor: id });
  }

  if (tag === "br") {
    out.push("\n");
    return;
  }
  if (tag === "pre") {
    out.push("\n\n", el.text, "\n\n");
    return;
  }
  const block = BLOCK.has(tag);
  if (block) out.push("\n\n");
  for (const child of el.childNodes) walk(child, out, anchors);
  if (CELL.has(tag)) out.push(" ");
  if (block) out.push("\n\n");
}
