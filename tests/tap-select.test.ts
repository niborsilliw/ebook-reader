// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rangeAtPoint } from "@/lib/reader/tap-select";

// jsdom has no layout, so the browser's hit-testing is stood in for: the
// caret lands at a chosen character, and every range has a box under the tap.
const ON_TEXT = { x: 5, y: 5 };
let caret: { node: Node; offset: number } | null = null;

beforeEach(() => {
  document.body.innerHTML = "";
  (document as unknown as { caretRangeFromPoint: () => Range | null }).caretRangeFromPoint = () => {
    if (!caret) return null;
    const r = document.createRange();
    r.setStart(caret.node, caret.offset);
    return r;
  };
  Range.prototype.getClientRects = () => [{ left: 0, right: 10, top: 0, bottom: 10 }] as unknown as DOMRectList;
});
afterEach(() => vi.restoreAllMocks());

/** Puts `html` in a paragraph and the caret just after the first occurrence of `marker` in its text. */
function tapAt(html: string, marker: string) {
  document.body.innerHTML = `<p>${html}</p><p>Another paragraph.</p>`;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const i = n.data.indexOf(marker);
    if (i >= 0) return void (caret = { node: n, offset: i + marker.length });
  }
  throw new Error(`no ${marker}`);
}
const select = (unit: "word" | "sentence" | "paragraph") => rangeAtPoint(document, ON_TEXT.x, ON_TEXT.y, unit, "en")?.toString();

describe("rangeAtPoint", () => {
  it("selects the word under the tap, keeping apostrophes and leaving punctuation", () => {
    tapAt("I couldn't see her face, she said.", "cou");
    expect(select("word")).toBe("couldn't");
    tapAt("I couldn't see her face, she said.", "fa");
    expect(select("word")).toBe("face");
  });

  it("selects the word whose last letter was tapped", () => {
    tapAt("Mother died today.", "died");
    expect(select("word")).toBe("died");
  });

  it("selects across inline markup", () => {
    tapAt("It was <em>un</em>bearable. Then quiet.", "un");
    expect(select("word")).toBe("unbearable");
    expect(select("sentence")).toBe("It was unbearable.");
  });

  it("selects the sentence around the word, without the space after it", () => {
    tapAt("The glare was strong. I asked him to turn off a lamp. He refused.", "ask");
    expect(select("sentence")).toBe("I asked him to turn off a lamp.");
  });

  it("selects the whole paragraph, and only that paragraph", () => {
    tapAt("  The glare was strong. I asked him.  ", "glare");
    expect(select("paragraph")).toBe("The glare was strong. I asked him.");
  });

  it("selects nothing for a tap that isn't on a word", () => {
    tapAt("* * *", "*"); // a section break
    expect(select("word")).toBeUndefined();
    caret = null;
    expect(select("word")).toBeUndefined();
  });

  it("selects nothing when the word isn't actually under the point (a tap in the margin)", () => {
    tapAt("Mother died today.", "Mot");
    Range.prototype.getClientRects = () => [{ left: 100, right: 140, top: 0, bottom: 10 }] as unknown as DOMRectList;
    expect(select("word")).toBeUndefined();
  });
});
