// BibTeX for the two things a reader can cite: the book (with the chapter
// of a highlighted passage) and a web page the companion found.

export type BookMeta = {
  title: string | null;
  author: string | null;
  publisher: string | null;
  /** As the EPUB gives it: "1946", "1946-05-01", … */
  published: string | null;
  isbn: string | null;
};

export type Passage = { chapter: string | null; text: string; note: string | null };

/** A web page as the search returned it (see messages.web_sources). */
export type WebPage = { url: string; title?: string | null; author?: string | null; published_date?: string | null };

export type BibEntry = { key: string; bibtex: string };

/** The book, as @inbook when a passage's chapter is known, otherwise @book. */
export function bookBibtex(book: BookMeta, passage?: Passage): BibEntry {
  const year = yearOf(book.published);
  const key = citeKey(book.author, year, book.title, "anon");
  const quote = passage?.text.replace(/\s+/g, " ").trim();
  const annote = [quote && `“${quote}”`, passage?.note?.trim()].filter(Boolean).join(" — ");
  const fields: [string, string | null][] = [
    ["author", authors(book.author)],
    ["title", book.title && `{${tex(book.title)}}`],
    ["chapter", passage?.chapter ? tex(passage.chapter) : null],
    ["publisher", book.publisher && tex(book.publisher)],
    ["year", year],
    ["isbn", book.isbn],
    ["annote", annote ? tex(annote) : null],
  ];
  return { key, bibtex: entry(passage?.chapter ? "inbook" : "book", key, fields) };
}

/** A web page, as @misc with its address and the date it was looked up. */
export function webBibtex(page: WebPage, accessed: Date): BibEntry {
  const year = yearOf(page.published_date);
  const host = hostOf(page.url);
  const key = citeKey(page.author, year, page.title, host.split(".").at(-2) ?? "web");
  const day = accessed.toISOString().slice(0, 10);
  const fields: [string, string | null][] = [
    ["author", authors(page.author)],
    ["title", `{${tex(page.title || host)}}`],
    ["year", year],
    ["howpublished", `\\url{${page.url}}`],
    ["url", page.url],
    ["urldate", day],
    ["note", `Accessed ${day}`],
  ];
  return { key, bibtex: entry("misc", key, fields) };
}

function entry(type: string, key: string, fields: [string, string | null][]) {
  const lines = fields.filter(([, v]) => v).map(([name, v]) => `  ${name} = {${v}}`);
  return `@${type}{${key},\n${lines.join(",\n")}\n}\n`;
}

/**
 * BibTeX authors are joined with "and". The EPUB's creators arrive joined
 * with ", " (see parseEpub), which can't be told from "Camus, Albert" by
 * the comma alone: it is a list only if every part is a full "First Last".
 */
export function authors(author: string | null | undefined): string | null {
  const a = author?.trim();
  if (!a) return null;
  const parts = a.split(/\s*;\s*|\s+&\s+|\s+and\s+/).flatMap((p) => {
    const names = p.split(/\s*,\s*/);
    return names.length > 1 && names.every((n) => n.split(/\s+/).length > 1) ? names : [p];
  });
  return parts.map(tex).join(" and ");
}

export function yearOf(date: string | null | undefined) {
  return date?.match(/\b(1[0-9]|20)\d{2}\b/)?.[0] ?? null;
}

/** camus1946stranger: first author's surname, year, first real word of the title. */
function citeKey(author: string | null | undefined, year: string | null, title: string | null | undefined, fallback: string) {
  const first = author?.split(/\s*;\s*|\s+and\s+/)[0]?.trim() ?? "";
  // "Camus, Albert" → Camus; "Albert Camus" → Camus.
  const surname = first.includes(",") && first.split(/\s*,\s*/).every((n) => n.split(/\s+/).length === 1)
    ? first.split(",")[0]
    : (first.split(/\s*,\s*/)[0] ?? "").split(/\s+/).at(-1);
  const word = (title ?? "").split(/\s+/).map(ascii).find((w) => w.length > 3 && !STOP.has(w)) ?? "";
  return `${ascii(surname ?? "") || ascii(fallback)}${year ?? ""}${word}` || "source";
}

const STOP = new Set(["the", "and", "with", "from", "that", "this", "what", "about"]);

function ascii(s: string) {
  return s.normalize("NFD").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// LaTeX's special characters, escaped so a title or quote typesets as written.
const SPECIAL: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  "&": "\\&",
  "%": "\\%",
  $: "\\$",
  "#": "\\#",
  _: "\\_",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
};

export function tex(s: string) {
  return s.replace(/[\\{}&%$#_~^]/g, (c) => SPECIAL[c]);
}

/** Saves a .bib file in the browser. */
export function downloadBib({ key, bibtex }: BibEntry) {
  const url = URL.createObjectURL(new Blob([bibtex], { type: "application/x-bibtex" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${key}.bib`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
