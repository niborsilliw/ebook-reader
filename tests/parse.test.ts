import { describe, expect, it } from "vitest";
import { parseEpub, EpubParseError, resolveHref } from "@/lib/epub/parse";
import { expandSelfClosing, htmlToSegments, htmlToText } from "@/lib/epub/html-to-text";
import { epub2, epub3, gutenbergStyleEpub } from "./fixtures";

describe("parseEpub — EPUB 3 (nav document)", async () => {
  const book = await parseEpub(await epub3());

  it("reads metadata without coercing numeric titles", () => {
    expect(book.title).toBe("1984");
    expect(book.author).toBe("George Orwell");
    expect(book.language).toBe("en");
  });

  it("reads the publisher, date and ISBN for citations", () => {
    expect(book.publisher).toBe("Secker & Warburg");
    expect(book.published).toBe("1949-06-08");
    expect(book.isbn).toBe("9780452284234");
  });

  it("reads the toc nav (not landmarks), nested levels, hrefs relative to the OPF, decoded", () => {
    expect(book.toc).toEqual([
      { title: "Part One", href: "Text/chapter 1.xhtml", level: 0 },
      { title: "Section & Two", href: "Text/chapter 1.xhtml#s2", level: 1 },
      { title: "Part Two", href: "Text/chapter2.xhtml", level: 0 },
    ]);
  });

  it("splits spine files at TOC anchors, with manifest-relative hrefs", () => {
    expect(book.sections.map((s) => [s.spineIndex, s.href])).toEqual([
      [0, "Text/title.xhtml"],
      [1, "Text/chapter 1.xhtml"],
      [1, "Text/chapter 1.xhtml#s2"],
      [2, "Text/chapter1b.xhtml"],
      [3, "Text/chapter2.xhtml"],
    ]);
  });

  it("labels sections from the TOC, inheriting across split files", () => {
    expect(book.sections.map((s) => s.chapterTitle)).toEqual([
      null,
      "Part One",
      "Part One › Section & Two",
      "Part One › Section & Two",
      "Part Two",
    ]);
  });

  it("extracts clean text", () => {
    expect(book.sections[1].text).toBe(
      "Part One\n\nIt was a bright cold day in April, and the clocks were striking thirteen.",
    );
    expect(book.sections[2].text).toBe("Winston Smith & his chin\nnuzzled into his breast.\n\nWar is Peace");
  });

  it("finds the cover-image", () => {
    expect(book.cover).toMatchObject({ mediaType: "image/jpeg", ext: "jpg" });
    expect(book.cover?.data.length).toBe(4);
  });
});

describe("parseEpub — EPUB 2 (NCX)", async () => {
  const book = await parseEpub(await epub2());

  it("reads metadata and NCX toc", () => {
    expect(book.title).toBe("Pride and Prejudice");
    expect(book.author).toBe("Jane Austen");
    // The publication date, not the file's creation; the ISBN, not the UUID.
    expect(book.published).toBe("1813");
    expect(book.isbn).toBe("0141439513");
    expect(book.publisher).toBeNull();
    expect(book.toc).toEqual([
      { title: "Chapter 1", href: "ch1.html", level: 0 },
      { title: "Chapter 1, part 2", href: "ch1.html#p2", level: 1 },
      { title: "Chapter 2", href: "ch2.html", level: 0 },
    ]);
  });

  it("uses the first toc entry for a file as its chapter title", () => {
    expect(book.sections.map((s) => s.chapterTitle)).toEqual(["Chapter 1", "Chapter 2"]);
  });

  it("finds the EPUB 2 meta cover", () => {
    expect(book.cover).toMatchObject({ mediaType: "image/png", ext: "png" });
  });
});

describe("parseEpub — errors", () => {
  it("rejects non-zip input", async () => {
    await expect(parseEpub(new TextEncoder().encode("not a zip"))).rejects.toBeInstanceOf(EpubParseError);
  });
});

describe("helpers", () => {
  it("resolveHref normalizes ../ and keeps fragments", () => {
    expect(resolveHref("nav", "../Text/a%20b.xhtml#x")).toBe("Text/a b.xhtml#x");
    expect(resolveHref("", "a.xhtml")).toBe("a.xhtml");
  });

  // <pre> keeps its line breaks; indentation is dropped (irrelevant for retrieval).
  it("htmlToText drops head/script/style and keeps <pre> line breaks", () => {
    expect(htmlToText("<html><head><title>T</title></head><body><style>x</style><p>a</p><pre>b\n  c</pre></body></html>")).toBe(
      "a\n\nb\nc",
    );
  });
});

describe("parseEpub — several chapters per file (Project Gutenberg's Ethics layout)", async () => {
  const book = await parseEpub(await gutenbergStyleEpub());
  const byTitle = (t: string) => book.sections.find((s) => s.chapterTitle === t);

  it("labels each section from its own TOC anchor, not the file's first entry", () => {
    expect(book.sections.map((s) => s.chapterTitle)).toEqual([
      "Part I. Concerning God › Definitions",
      "Part I. Concerning God › Propositions",
      "Part II: On the Nature and Origin of the Mind › Preface",
      "Part II: On the Nature and Origin of the Mind › Propositions",
      "Part V: Of the Power of the Understanding, or of Human Freedom › Propositions",
    ]);
  });

  it("points each section at its anchor, so citations jump to it", () => {
    expect(byTitle("Part II: On the Nature and Origin of the Mind › Propositions")?.href).toBe("Text/book-0.xhtml#p2props");
    expect(byTitle("Part I. Concerning God › Definitions")?.text).toContain("By God, I mean a being absolutely infinite");
    expect(byTitle("Part I. Concerning God › Definitions")?.text).not.toContain("the mind");
  });

  it("drops the Project Gutenberg header, end marker and license, keeping the book text around them", () => {
    const all = book.sections.map((s) => `${s.chapterTitle} ${s.text}`).join("\n");
    expect(all).not.toMatch(/Project Gutenberg/i);
    expect(byTitle("Part V: Of the Power of the Understanding, or of Human Freedom › Propositions")?.text).toBe(
      "PROPOSITIONS.\n\nProp. III. An emotion which is a passion ceases to be a passion.",
    );
  });
});

describe("labels", async () => {
  const { cleanTitle, applyHeadings, labelOf, EMPTY_LABEL, isHeadingOnly } = await import("@/lib/epub/labels");
  const e = (title: string, level: number) => ({ title, href: "x", level });

  it("cleans titles: trailing punctuation, all-caps to title case, Roman numerals kept", () => {
    expect(cleanTitle("PART I. CONCERNING GOD.")).toBe("Part I. Concerning God");
    expect(cleanTitle("PART V:")).toBe("Part V");
    expect(cleanTitle("ON THE ORIGIN AND NATURE OF THE EMOTIONS")).toBe("On the Origin and Nature of the Emotions");
    expect(cleanTitle("Of Human Bondage, or the Strength of the Emotions")).toBe("Of Human Bondage, or the Strength of the Emotions");
    expect(cleanTitle("CIVIL WAR")).toBe("Civil War");
  });

  it("merges a bare 'Part N' with its subtitle and nests sections under it", () => {
    let s = applyHeadings(EMPTY_LABEL, [e("PART II.", 0), e("ON THE NATURE AND ORIGIN OF THE MIND", 1), e("PREFACE", 2)], 0);
    expect(labelOf(s)).toBe("Part II: On the Nature and Origin of the Mind › Preface");
    s = applyHeadings(s, [e("PROPOSITIONS", 2)], 0);
    expect(labelOf(s)).toBe("Part II: On the Nature and Origin of the Mind › Propositions");
  });

  it("treats 'Part N' as a division even when the TOC nests it too deep", () => {
    const s = applyHeadings({ division: "Part IV", section: "Appendix" }, [e("PART V:", 2)], 0);
    expect(labelOf(s)).toBe("Part V");
  });

  it("detects heading-only segments", () => {
    expect(isHeadingOnly("PART II.", [e("PART II.", 0)])).toBe(true);
    expect(isHeadingOnly("", [])).toBe(true);
    expect(isHeadingOnly("PART II.\n\nThe mind is the idea of the body.", [e("PART II.", 0)])).toBe(false);
  });
});

describe("XHTML self-closing tags", () => {
  it("expands non-void self-closing elements and leaves void ones alone", () => {
    expect(expandSelfClosing('<pre/><a id="x"/><div class="c" /><br/><img src="a.png"/><epub:x/>')).toBe(
      '<pre></pre><a id="x"></a><div class="c"></div><br/><img src="a.png"/><epub:x></epub:x>',
    );
  });

  it("a self-closing <pre/> no longer swallows the rest of the document (Gutenberg header)", () => {
    const html = `<html><body><header><pre/><p>header</p></header>
      <h2 id="p1">PART I.</h2><p>Text one.</p><h2 id="p2">PART II.</h2><p>Text two.</p></body></html>`;
    const segments = htmlToSegments(html, new Set(["p1", "p2"]));
    expect(segments.map((s) => s.anchor)).toEqual([null, "p1", "p2"]);
    expect(segments[2].text).toBe("PART II.\n\nText two.");
    expect(segments.map((s) => s.text).join(" ")).not.toMatch(/<\/?(p|h2|body|html)\b/);
  });
});
