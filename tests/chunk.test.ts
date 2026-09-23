import { describe, expect, it } from "vitest";
import { chunkBook, chunkText, embeddingInput, estimateTokens, CHARS_PER_TOKEN } from "@/lib/ingest/chunk";
import { parseEpub } from "@/lib/epub/parse";
import { largeEpub } from "./fixtures";

const words = (n: number, prefix = "w") => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");

describe("chunkText", () => {
  it("returns one chunk for short text and none for empty", () => {
    expect(chunkText("hello world")).toEqual(["hello world"]);
    expect(chunkText("  \n\n  ")).toEqual([]);
  });

  it("never exceeds 500 tokens and starts each later chunk with the previous tail", () => {
    const text = Array.from({ length: 60 }, (_, i) => words(40, `p${i}_`) + ".").join("\n\n");
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(estimateTokens(c)).toBeLessThanOrEqual(500);
    for (let i = 1; i < chunks.length; i++) {
      const overlap = chunks[i].split("\n\n")[0];
      expect(chunks[i - 1].endsWith(overlap)).toBe(true);
      expect(estimateTokens(overlap)).toBeLessThanOrEqual(50);
      expect(estimateTokens(overlap)).toBeGreaterThan(30);
    }
  });

  it("fills chunks close to the target size", () => {
    const text = Array.from({ length: 200 }, (_, i) => words(20, `p${i}_`)).join("\n\n");
    const sizes = chunkText(text).slice(0, -1).map(estimateTokens);
    for (const s of sizes) expect(s).toBeGreaterThan(400);
  });

  it("loses no text: every paragraph appears in some chunk", () => {
    const paras = Array.from({ length: 80 }, (_, i) => `para${i} ` + words(30, `x${i}_`));
    const joined = chunkText(paras.join("\n\n")).join("\n");
    for (const p of paras) expect(joined).toContain(p);
  });

  it("splits an oversized paragraph on sentences", () => {
    const sentence = (i: number) => `Sentence ${i} ${words(30, `s${i}_`)}.`;
    const para = Array.from({ length: 30 }, (_, i) => sentence(i)).join(" ");
    expect(estimateTokens(para)).toBeGreaterThan(500);
    const chunks = chunkText(para);
    for (const c of chunks) expect(estimateTokens(c)).toBeLessThanOrEqual(500);
    for (let i = 0; i < 30; i++) expect(chunks.some((c) => c.includes(sentence(i)))).toBe(true);
  });

  it("hard-splits a single enormous sentence and an unbroken token", () => {
    const run = words(2000); // no sentence punctuation
    const blob = "x".repeat(5000); // no whitespace at all
    for (const text of [run, blob]) {
      const chunks = chunkText(text);
      expect(chunks.length).toBeGreaterThan(1);
      for (const c of chunks) expect(estimateTokens(c)).toBeLessThanOrEqual(500);
    }
    // Content is preserved (modulo overlap) for the whitespace-free case.
    const chunks = chunkText(blob);
    expect(chunks.join("").replace(/\s/g, "").length).toBeGreaterThanOrEqual(5000);
  });

  it("respects custom sizes", () => {
    const chunks = chunkText(Array.from({ length: 50 }, (_, i) => words(10, `q${i}_`)).join("\n\n"), {
      maxTokens: 100,
      overlapTokens: 10,
    });
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(100 * CHARS_PER_TOKEN);
  });
});

describe("chunkBook", () => {
  it("never crosses spine items and numbers chunks sequentially", () => {
    const rows = chunkBook({
      sections: [
        { spineIndex: 0, href: "a.xhtml", chapterTitle: "A", text: words(1500, "a") },
        { spineIndex: 1, href: "b.xhtml", chapterTitle: null, text: "" },
        { spineIndex: 2, href: "c.xhtml", chapterTitle: "C", text: words(300, "c") },
      ],
    });
    expect(rows.map((r) => r.chunk_index)).toEqual(rows.map((_, i) => i));
    for (const r of rows) {
      const fromA = /\ba\d/.test(r.content);
      const fromC = /\bc\d/.test(r.content);
      expect(fromA && fromC).toBe(false);
      expect(r.spine_href).toBe(fromA ? "a.xhtml" : "c.xhtml");
      expect(r.token_count).toBe(estimateTokens(r.content));
    }
    expect(rows.filter((r) => r.spine_index === 1)).toHaveLength(0);
  });

  it("handles a large book quickly", async () => {
    // 600k (short) words, ~500k tokens: roughly War and Peace's token count.
    const started = performance.now();
    const book = await parseEpub(await largeEpub(300, 2000));
    const rows = chunkBook(book);
    const ms = performance.now() - started;
    expect(book.sections).toHaveLength(300);
    const bookTokens = book.sections.reduce((n, s) => n + estimateTokens(s.text), 0);
    // Each chunk adds at most ~450 tokens of new text.
    expect(rows.length).toBeGreaterThanOrEqual(Math.ceil(bookTokens / 450));
    expect(rows.length).toBeLessThan(Math.ceil(bookTokens / 400) + book.sections.length);
    expect(new Set(rows.map((r) => r.chapter_title)).size).toBe(300);
    for (const r of rows) expect(r.token_count).toBeLessThanOrEqual(500);
    expect(ms).toBeLessThan(15_000);
    console.log(`large book: ${book.sections.length} sections, ${rows.length} chunks, ${Math.round(ms)} ms`);
  }, 30_000);
});

describe("embeddingInput", () => {
  it("prefixes book and chapter titles when present", () => {
    expect(embeddingInput({ content: "x", chapter_title: "Ch 1" }, "Book")).toBe("Book — Ch 1\n\nx");
    expect(embeddingInput({ content: "x", chapter_title: null }, null)).toBe("x");
  });
});
