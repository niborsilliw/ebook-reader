import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageView } from "@/components/assistant/message-view";
import type { ChatUIMessage } from "@/lib/chat/types";

const answer = (text: string) =>
  ({
    id: "a",
    role: "assistant",
    parts: [
      { type: "data-citations", data: [{ n: 1, chunk_id: 1, spine_href: "c1.xhtml", chapter_title: "Part One" }] },
      { type: "text", text },
    ],
  }) as ChatUIMessage;
const render = (text: string, streaming = false) =>
  renderToStaticMarkup(<MessageView message={answer(text)} bookTitle="The Stranger" streaming={streaming} onCite={() => {}} />);
const visibleText = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

describe("web citations in an answer", () => {
  const text =
    "Meursault won't weep [1]. Arendt admired *The Rebel* (https://en.wikipedia.org/wiki/Hannah_Arendt)(https://plato.stanford.edu/entries/arendt/).";

  it("marks each cited page with a footnote letter instead of its address", () => {
    const html = render(text);
    const prose = html.slice(0, html.indexOf("<ul"));
    expect(visibleText(prose)).toBe("Meursault won't weep 1. Arendt admired The Rebela,b.");
    expect(prose).not.toContain("(https://");
    expect(prose).toContain('<a href="https://en.wikipedia.org/wiki/Hannah_Arendt" target="_blank" rel="noopener noreferrer"');
  });

  it("puts a 'From the web' chip for each page after the book's, opening in a new tab", () => {
    const chips = [...render(text).matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => m[1]);
    expect(chips.map(visibleText)).toEqual([
      "[1] From: The Stranger, Part One",
      "[a] From the web: en.wikipedia.orgCite",
      "[b] From the web: plato.stanford.eduCite",
    ]);
    expect(chips[2]).toMatch(/^<a href="https:\/\/plato.stanford.edu\/entries\/arendt\/" target="_blank" rel="noopener noreferrer"/);
  });

  it("shows web chips even when the answer cites no passage, and none while it streams", () => {
    expect(visibleText(render("See (https://plato.stanford.edu/entries/arendt/)."))).toContain("[a] From the web: plato.stanford.edu");
    expect(render(text, true)).not.toContain("From the web");
  });
});
