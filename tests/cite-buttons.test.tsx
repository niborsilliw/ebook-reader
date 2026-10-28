// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NotesPanel } from "@/components/notes/notes-panel";
import { MessageView } from "@/components/assistant/message-view";
import type { Highlight } from "@/lib/notes/types";
import type { ChatUIMessage } from "@/lib/chat/types";

let root: Root;
let container: HTMLDivElement;
// What the last download saved: file name and contents.
let saved: { name: string; text: Promise<string> } | null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  saved = null;
  let blob: Blob;
  URL.createObjectURL = (b: Blob) => ((blob = b), "blob:test");
  URL.revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    saved = { name: this.download, text: blob.text() };
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const button = (label: string) => [...container.querySelectorAll("button")].find((b) => b.textContent === label)!;

describe("the notes drawer's academic row", () => {
  const highlight: Highlight = {
    id: "h1",
    cfi_range: "epubcfi(/6/4!/4,/1:0,/1:5)",
    text: "Maman died today.",
    note: null,
    color: "yellow",
    chapter_title: "Part One, 1",
    verified: false,
    created_at: "2026-10-28T00:00:00Z",
  };
  const render = (props: Partial<Parameters<typeof NotesPanel>[0]>) =>
    act(() =>
      root.render(
        <NotesPanel
          highlights={[highlight]}
          bookmarks={[]}
          activeId="h1"
          focusNote={0}
          onActivate={() => {}}
          onSaveNote={async () => true}
          onSetVerified={() => {}}
          onCite={() => {}}
          onDeleteHighlight={() => {}}
          onDeleteBookmark={() => {}}
          {...props}
        />,
      ),
    );

  it("marks an open highlight verified, and cites the book at it", () => {
    const onSetVerified = vi.fn();
    const onCite = vi.fn();
    render({ onSetVerified, onCite });
    act(() => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(onSetVerified).toHaveBeenCalledWith("h1", true);
    act(() => button("Cite this").click());
    expect(onCite).toHaveBeenCalledWith(highlight);
  });

  it("shows a closed highlight's verified mark without the controls", () => {
    render({ activeId: null, highlights: [{ ...highlight, verified: true }] });
    expect(container.textContent).toContain("✓ Verified");
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });
});

describe("Cite on a web source", () => {
  it("downloads the page as BibTeX, with what the search said about it", async () => {
    const message = {
      id: "a",
      role: "assistant",
      parts: [
        { type: "data-web-sources", data: [{ url: "https://plato.stanford.edu/entries/arendt/", title: "Hannah Arendt", author: "Maurizio Passerin d'Entreves", published_date: "2019-05-01" }] },
        { type: "text", text: "She admired him (https://plato.stanford.edu/entries/arendt)." },
      ],
    } as ChatUIMessage;
    act(() => root.render(<MessageView message={message} bookTitle="B" streaming={false} onCite={() => {}} />));
    act(() => button("Cite").click());
    expect(saved?.name).toBe("dentreves2019hannah.bib");
    const bib = await saved!.text;
    expect(bib).toMatch(/^@misc\{dentreves2019hannah,/);
    expect(bib).toContain("author = {Maurizio Passerin d'Entreves}");
  });
});
