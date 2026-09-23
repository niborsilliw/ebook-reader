import { parse, NodeType, type HTMLElement, type Node } from "node-html-parser";

const SKIP = new Set(["script", "style", "head", "title", "svg", "math", "noscript", "template"]);
const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "body", "dd", "div", "dl", "dt", "figcaption",
  "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav",
  "ol", "p", "pre", "section", "table", "tr", "ul",
]);
const CELL = new Set(["td", "th"]);

// XHTML chapter -> plain text with one paragraph per block element,
// paragraphs separated by a blank line. Entities are decoded.
export function htmlToText(html: string): string {
  const root = parse(html, { comment: false, blockTextElements: { pre: true } });
  const body = root.querySelector("body") ?? root;
  const out: string[] = [];
  walk(body, out);
  return out
    .join("")
    .split(/\n{2,}/)
    .map((para) => para.replace(/[ \t\f\v ]+/g, " ").replace(/ *\n */g, "\n").trim())
    .filter(Boolean)
    .join("\n\n");
}

function walk(node: Node, out: string[]) {
  if (node.nodeType === NodeType.TEXT_NODE) {
    // Source newlines are formatting, not line breaks.
    out.push(node.text.replace(/\s+/g, " "));
    return;
  }
  if (node.nodeType !== NodeType.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.rawTagName?.toLowerCase().replace(/^.*:/, "") ?? "";
  if (SKIP.has(tag)) return;
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
  for (const child of el.childNodes) walk(child, out);
  if (CELL.has(tag)) out.push(" ");
  if (block) out.push("\n\n");
}
