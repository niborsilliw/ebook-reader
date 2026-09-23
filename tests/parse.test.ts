import { describe, expect, it } from "vitest";
import { parseEpub, EpubParseError, resolveHref } from "@/lib/epub/parse";
import { htmlToText } from "@/lib/epub/html-to-text";
import { epub2, epub3 } from "./fixtures";

describe("parseEpub — EPUB 3 (nav document)", async () => {
  const book = await parseEpub(await epub3());

  it("reads metadata without coercing numeric titles", () => {
    expect(book.title).toBe("1984");
    expect(book.author).toBe("George Orwell");
    expect(book.language).toBe("en");
  });

  it("reads the toc nav (not landmarks), nested levels, hrefs relative to the OPF, decoded", () => {
    expect(book.toc).toEqual([
      { title: "Part One", href: "Text/chapter 1.xhtml", level: 0 },
      { title: "Section & Two", href: "Text/chapter 1.xhtml#s2", level: 1 },
      { title: "Part Two", href: "Text/chapter2.xhtml", level: 0 },
    ]);
  });

  it("emits one section per spine item with manifest-relative hrefs", () => {
    expect(book.sections.map((s) => [s.spineIndex, s.href])).toEqual([
      [0, "Text/title.xhtml"],
      [1, "Text/chapter 1.xhtml"],
      [2, "Text/chapter1b.xhtml"],
      [3, "Text/chapter2.xhtml"],
    ]);
  });

  it("assigns chapter titles, inheriting across split files", () => {
    expect(book.sections.map((s) => s.chapterTitle)).toEqual([null, "Part One", "Part One", "Part Two"]);
  });

  it("extracts clean text", () => {
    expect(book.sections[1].text).toBe(
      "Part One\n\nIt was a bright cold day in April, and the clocks were striking thirteen.\n\n" +
        "Winston Smith & his chin\nnuzzled into his breast.\n\nWar is Peace",
    );
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
