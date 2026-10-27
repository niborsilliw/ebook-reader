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
