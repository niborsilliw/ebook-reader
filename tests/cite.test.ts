import { describe, expect, it } from "vitest";
import { authors, bookBibtex, tex, webBibtex, yearOf } from "@/lib/cite/bibtex";
import { toIsbn } from "@/lib/cite/isbn";
import { pageFor } from "@/components/assistant/citation-chips";

const stranger = { title: "The Stranger", author: "Albert Camus", publisher: "Vintage International", published: "1989-03-13", isbn: "9780679720201" };

describe("bookBibtex", () => {
  it("cites the book at a highlighted passage as @inbook, with chapter, quote and note", () => {
    const { key, bibtex } = bookBibtex(stranger, { chapter: "Part One, 1", text: "Maman died today.\nOr yesterday maybe", note: "Opening line" });
    expect(key).toBe("camus1989stranger");
    expect(bibtex).toBe(
      [
        "@inbook{camus1989stranger,",
        "  author = {Albert Camus},",
        "  title = {{The Stranger}},",
        "  chapter = {Part One, 1},",
        "  publisher = {Vintage International},",
        "  year = {1989},",
        "  isbn = {9780679720201},",
        "  annote = {“Maman died today. Or yesterday maybe” — Opening line}",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("is a plain @book without a chapter, and leaves out what the EPUB didn't give", () => {
    const { bibtex } = bookBibtex({ title: "Big Book", author: null, publisher: null, published: null, isbn: null });
    expect(bibtex).toBe("@book{anonbook,\n  title = {{Big Book}}\n}\n");
  });
});

describe("webBibtex", () => {
  it("cites a page as @misc with its address and the day it was looked up", () => {
    const page = { url: "https://plato.stanford.edu/entries/arendt/", title: "Hannah Arendt", author: "Maurizio Passerin d'Entreves", published_date: "2019-05-01T00:00:00Z" };
    const { key, bibtex } = webBibtex(page, new Date("2026-10-28T10:00:00Z"));
    expect(key).toBe("dentreves2019hannah");
    expect(bibtex).toContain("@misc{dentreves2019hannah,");
    expect(bibtex).toContain("  title = {{Hannah Arendt}},");
    expect(bibtex).toContain("  howpublished = {\\url{https://plato.stanford.edu/entries/arendt/}},");
    expect(bibtex).toContain("  urldate = {2026-10-28},");
  });

  it("falls back to the site for a page the search didn't describe", () => {
    const { key, bibtex } = webBibtex({ url: "https://www.sysprv.com/sartre.html" }, new Date("2026-10-28T10:00:00Z"));
    expect(key).toBe("sysprv");
    expect(bibtex).toContain("  title = {{sysprv.com}},");
    expect(bibtex).not.toContain("author");
  });

  it("matches a cited address to the search's record despite small differences", () => {
    const pages = [{ url: "https://www.example.org/a/", title: "A" }];
    expect(pageFor("https://example.org/a#top", pages).title).toBe("A");
    expect(pageFor("https://example.org/b", pages)).toEqual({ url: "https://example.org/b" });
  });
});

describe("BibTeX fields", () => {
  it("joins several authors with 'and', but keeps 'Surname, First' as one", () => {
    expect(authors("Albert Camus, Matthew Ward")).toBe("Albert Camus and Matthew Ward");
    expect(authors("Camus, Albert")).toBe("Camus, Albert");
    expect(authors("Gilles Deleuze & Félix Guattari")).toBe("Gilles Deleuze and Félix Guattari");
    expect(authors("  ")).toBeNull();
  });

  it("escapes LaTeX's special characters", () => {
    expect(tex("Fear & Loathing: 100% #1 {x}_y ~ ^ \\")).toBe("Fear \\& Loathing: 100\\% \\#1 \\{x\\}\\_y \\textasciitilde{} \\textasciicircum{} \\textbackslash{}");
  });

  it("finds the year in any date form", () => {
    expect(yearOf("1946")).toBe("1946");
    expect(yearOf("2004-05-01T00:00:00Z")).toBe("2004");
    expect(yearOf("May 1942")).toBe("1942");
    expect(yearOf("n.d.")).toBeNull();
  });
});

describe("toIsbn", () => {
  it("accepts ISBN-10 and -13 in the forms EPUBs use", () => {
    expect(toIsbn("urn:isbn:978-0-679-72020-1")).toBe("9780679720201");
    expect(toIsbn("ISBN 0-679-72020-0")).toBe("0679720200");
    expect(toIsbn("080442957X")).toBe("080442957X");
  });

  it("rejects identifiers that aren't ISBNs", () => {
    expect(toIsbn("urn:uuid:8d9f1c2e-1234-4abc-9def-000000000000")).toBeNull();
    expect(toIsbn("9780679720202")).toBeNull(); // bad checksum
    expect(toIsbn(null)).toBeNull();
  });
});
