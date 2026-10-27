// Web addresses in the companion's answers (cited from a web search), found
// so they can be shown as links. The prompt asks for a bare address in
// parentheses, but models also write Markdown links, <angle-bracketed>
// addresses and addresses without a scheme, so all of those are found too.

export type TextPiece = string | { href: string; label: string };

// Characters an address may contain, allowing one level of balanced
// parentheses (Wikipedia: .../The_Stranger_(Camus_novel)).
const URL_BODY = String.raw`(?:[^\s()<>\[\]]|\([^\s()<>]*\))+`;
const LINK = new RegExp(
  [
    String.raw`\[([^\]\n]+)\]\(((?:https?:\/\/|www\.)${URL_BODY})\)`, // [label](address)
    String.raw`<((?:https?:\/\/|www\.)[^\s<>]+)>`, // <address>
    String.raw`((?:https?:\/\/|www\.)${URL_BODY})`, // bare address
  ].join("|"),
  "gi",
);
// Punctuation that ends the sentence rather than the address.
const TRAILING = /[.,;:!?'"*_]+$/;

/** Splits text into plain strings and links, in order. */
export function splitLinks(text: string): TextPiece[] {
  // Several citations in a row, "(a)(b)", read better as "(a, b)".
  const joined = text.replace(/\)\s*\((?=(?:https?:\/\/|www\.))/gi, ", ");
  const out: TextPiece[] = [];
  let last = 0;
  for (const m of joined.matchAll(LINK)) {
    let raw = m[2] ?? m[3] ?? m[4];
    let end = m.index + m[0].length;
    if (m[4]) {
      const trail = raw.match(TRAILING)?.[0] ?? "";
      raw = raw.slice(0, raw.length - trail.length);
      end -= trail.length;
    }
    const href = /^www\./i.test(raw) ? `https://${raw}` : raw;
    let host: string;
    try {
      host = new URL(href).hostname.replace(/^www\./, "");
    } catch {
      continue; // not an address after all; leave it as text
    }
    if (m.index > last) out.push(joined.slice(last, m.index));
    out.push({ href, label: m[1] ?? host });
    last = end;
  }
  if (last < joined.length) out.push(joined.slice(last));
  return out;
}

/** A web page the answer cites, marked a, b, c… in the order first cited. */
export type WebSource = { mark: string; href: string; host: string };
export type CitedPiece = string | { mark: string; href: string };

// A citation's parenthesis around one or more addresses, "(a, b)", is
// replaced by the marks themselves; anything else in it keeps it.
const OPENS_CITATION = /\s*\($/;
const BETWEEN_CITATIONS = /^\s*[,;]\s*$/;

/**
 * The answer with each cited web address replaced by a footnote-style mark,
 * and the pages it cites, for chips under the answer. A Markdown link keeps
 * its words, followed by the mark.
 */
export function webCitations(text: string): { pieces: CitedPiece[]; sources: WebSource[] } {
  const links = splitLinks(text);
  const sources = new Map<string, WebSource>();
  const markFor = (link: { href: string; label: string }) => {
    let source = sources.get(link.href);
    if (!source) {
      const i = sources.size;
      const mark = String.fromCharCode(97 + (i % 26)).repeat(1 + Math.floor(i / 26));
      source = { mark, href: link.href, host: new URL(link.href).hostname.replace(/^www\./, "") };
      sources.set(link.href, source);
    }
    return { mark: source.mark, href: link.href };
  };
  const cite = (link: { href: string; label: string }): CitedPiece[] => {
    const marked = markFor(link);
    return link.label === new URL(link.href).hostname.replace(/^www\./, "") ? [marked] : [link.label, marked];
  };

  const pieces: CitedPiece[] = [];
  for (let i = 0; i < links.length; i++) {
    const piece = links[i];
    if (typeof piece !== "string") {
      pieces.push(...cite(piece));
      continue;
    }
    // "… evil (" followed by links and a ")": drop the parenthesis.
    let j = i + 1;
    const group: { href: string; label: string }[] = [];
    if (OPENS_CITATION.test(piece)) {
      while (typeof links[j] === "object") {
        group.push(links[j] as { href: string; label: string });
        const next = links[j + 1];
        if (typeof next === "string" && BETWEEN_CITATIONS.test(next) && typeof links[j + 2] === "object") j += 2;
        else break;
      }
    }
    const close = links[j + 1];
    if (group.length && typeof close === "string" && close.startsWith(")")) {
      pieces.push(piece.replace(OPENS_CITATION, ""));
      for (const link of group) pieces.push(...cite(link));
      // What follows the ")" may open the next citation, so it goes round again.
      links[j + 1] = close.slice(1);
      i = j;
    } else {
      pieces.push(piece);
    }
  }
  return { pieces: pieces.filter((p) => p !== ""), sources: [...sources.values()] };
}
