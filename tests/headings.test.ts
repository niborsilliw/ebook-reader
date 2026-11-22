// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { TITLE_CLASS, TITLE_STYLES, TITLE_UNJUSTIFIED_CLASS, markTitles } from "@/lib/reader/headings";

// The live jsdom document: a parsed one has no window to compute styles with.
const doc = (css: string, body: string) => {
  document.head.innerHTML = `<style>${css}</style>`;
  document.body.innerHTML = body;
  return document;
};
const centred = (d: Document, sel: string) => d.querySelector(sel)!.classList.contains(TITLE_UNJUSTIFIED_CLASS);

describe("markTitles", () => {
  it("centres a heading the publisher justified", () => {
    const d = doc(`h1, p { text-align: justify }`, `<h1>Nobody Said Anything</h1><p>${"Prose. ".repeat(40)}</p>`);
    expect(markTitles(d).map((e) => e.tagName)).toEqual(["H1"]);
    expect(centred(d, "h1")).toBe(true);
  });

  it("centres title paragraphs caught by a blanket p rule, but leaves the prose justified", () => {
    const d = doc(`p { text-align: justify }`, `<p class="chapter-title">Nobody Said Anything</p><p class="ct">One</p><p id="prose">${"Prose. ".repeat(40)}</p>`);
    markTitles(d);
    expect(centred(d, ".chapter-title")).toBe(true);
    expect(centred(d, ".ct")).toBe(true);
    expect(d.querySelector("#prose")!.classList.contains(TITLE_CLASS)).toBe(false);
  });

  it("centres a title whose last line would be stretched", () => {
    const d = doc(`h2 { text-align: center; text-align-last: justify }`, `<h2>Part One</h2>`);
    markTitles(d);
    expect(centred(d, "h2")).toBe(true);
  });

  it("keeps the publisher's own alignment of a title", () => {
    const d = doc(`h1 { text-align: left } h2 { text-align: center }`, `<h1>Left</h1><h2>Centre</h2>`);
    expect(markTitles(d)).toEqual([]);
    expect(d.querySelector("h1")!.classList.contains(TITLE_CLASS)).toBe(true);
  });

  it("ignores long 'title' blocks, which are prose", () => {
    const d = doc(`div { text-align: justify }`, `<div class="titlepage-text">${"Words and more words. ".repeat(20)}</div>`);
    expect(markTitles(d)).toEqual([]);
  });

  it("never hyphenates titles, and centres the last line as well as the rest", () => {
    expect(TITLE_STYLES[`h1, h2, h3, h4, h5, h6, .${TITLE_CLASS}`]).toMatchObject({ hyphens: "none !important" });
    expect(TITLE_STYLES[`.${TITLE_UNJUSTIFIED_CLASS}`]).toEqual({ "text-align": "center !important", "text-align-last": "center !important" });
  });
});
