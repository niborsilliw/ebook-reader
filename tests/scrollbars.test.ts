// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { HIDDEN_SCROLLBAR_CSS, hideScrollbars } from "@/lib/reader/scrollbars";

describe("hideScrollbars", () => {
  it("adds one stylesheet that hides scrollbars without touching overflow", () => {
    const doc = document.implementation.createHTMLDocument("c");
    hideScrollbars(doc);
    hideScrollbars(doc);
    const styles = doc.head.querySelectorAll("style");
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain("scrollbar-width: none");
    expect(styles[0].textContent).toContain("::-webkit-scrollbar");
    expect(HIDDEN_SCROLLBAR_CSS).not.toMatch(/overflow\s*:/);
  });
});
