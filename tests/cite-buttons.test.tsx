// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NotesPanel } from "@/components/notes/notes-panel";
import { MessageView } from "@/components/assistant/message-view";
import type { Highlight } from "@/lib/notes/types";
import type { ChatUIMessage } from "@/lib/chat/types";
import { copyBib } from "@/lib/cite/copy";
import { strings } from "@/lib/i18n/strings";

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

let root: Root;
let container: HTMLDivElement;
// What the last download saved: file name and contents.
let saved: { name: string; text: Promise<string> } | null;
let clipboard: { writeText: ReturnType<typeof vi.fn> } | undefined;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  saved = null;
  toast.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
  clipboard = { writeText: vi.fn(async () => {}) };
  Object.defineProperty(navigator, "clipboard", { configurable: true, get: () => clipboard });
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
  it("copies the page as BibTeX, with what the search said about it", async () => {
    const message = {
      id: "a",
      role: "assistant",
      parts: [
        { type: "data-web-sources", data: [{ url: "https://plato.stanford.edu/entries/arendt/", title: "Hannah Arendt", author: "Maurizio Passerin d'Entreves", published_date: "2019-05-01" }] },
        { type: "text", text: "She admired him (https://plato.stanford.edu/entries/arendt)." },
      ],
    } as ChatUIMessage;
    act(() => root.render(<MessageView message={message} bookTitle="B" streaming={false} onCite={() => {}} />));
    await act(async () => button("Cite").click());
    const bib = clipboard!.writeText.mock.calls[0][0] as string;
    expect(bib).toMatch(/^@misc\{dentreves2019hannah,/);
    expect(bib).toContain("author = {Maurizio Passerin d'Entreves}");
    expect(toast.success).toHaveBeenCalledWith("BibTeX copied to clipboard");
    expect(saved).toBeNull();
  });
});

describe("copyBib", () => {
  const entry = { key: "camus1989stranger", bibtex: "@book{camus1989stranger,\n}\n" };

  it("downloads the .bib instead when the clipboard refuses", async () => {
    clipboard!.writeText.mockRejectedValueOnce(new Error("NotAllowedError"));
    await copyBib(entry, strings("en"));
    expect(saved?.name).toBe("camus1989stranger.bib");
    expect(await saved!.text).toBe(entry.bibtex);
    expect(toast).toHaveBeenCalledWith("Couldn’t copy, so it was downloaded as camus1989stranger.bib");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("downloads it when there is no clipboard at all", async () => {
    clipboard = undefined;
    await copyBib(entry, strings("en"));
    expect(saved?.name).toBe("camus1989stranger.bib");
  });
});

describe("Copy on an assistant reply", () => {
  const text = "Arendt admired *The Rebel* [1] (https://plato.stanford.edu/entries/arendt/).";
  const reply = { id: "a", role: "assistant", parts: [{ type: "text", text }] } as ChatUIMessage;
  const copyButton = () => container.querySelector<HTMLButtonElement>('button[aria-label="Copy reply"]');

  it("copies the reply as plain text and says so", async () => {
    act(() => root.render(<MessageView message={reply} bookTitle="B" streaming={false} onCite={() => {}} />));
    await act(async () => copyButton()!.click());
    expect(clipboard!.writeText).toHaveBeenCalledWith("Arendt admired The Rebel (https://plato.stanford.edu/entries/arendt/).");
    expect(toast.success).toHaveBeenCalledWith("Copied to clipboard.");
  });

  it("isn't offered while the reply is still arriving, or on the reader's own messages", () => {
    act(() => root.render(<MessageView message={reply} bookTitle="B" streaming onCite={() => {}} />));
    expect(copyButton()).toBeNull();
    act(() => root.render(<MessageView message={{ ...reply, role: "user" }} bookTitle="B" streaming={false} onCite={() => {}} />));
    expect(copyButton()).toBeNull();
  });

  it("says so when the copy fails, without downloading anything", async () => {
    clipboard!.writeText.mockRejectedValueOnce(new Error("NotAllowedError"));
    act(() => root.render(<MessageView message={reply} bookTitle="B" streaming={false} onCite={() => {}} />));
    await act(async () => copyButton()!.click());
    expect(toast.error).toHaveBeenCalledWith("Couldn’t copy this reply.");
    expect(saved).toBeNull();
  });
});

describe("Share on an assistant reply", () => {
  const text = "Meursault won't *perform* grief [2].";
  const plain = "Meursault won't perform grief.";
  const reply = { id: "a", role: "assistant", parts: [{ type: "text", text }] } as ChatUIMessage;
  const shareButton = () => container.querySelector<HTMLButtonElement>('button[aria-label="Share reply"]');
  const render = () => act(() => root.render(<MessageView message={reply} bookTitle="The Stranger" streaming={false} onCite={() => {}} />));
  let share: ReturnType<typeof vi.fn> | undefined;
  beforeEach(() => {
    share = vi.fn(async () => {});
    Object.defineProperty(navigator, "share", { configurable: true, get: () => share });
  });

  it("opens the system share sheet with the reply as plain text", async () => {
    render();
    await act(async () => shareButton()!.click());
    expect(share).toHaveBeenCalledWith({ title: "The Stranger", text: plain });
    expect(clipboard!.writeText).not.toHaveBeenCalled();
  });

  it("does nothing more when the reader cancels the share sheet", async () => {
    share!.mockRejectedValueOnce(Object.assign(new Error("cancelled"), { name: "AbortError" }));
    render();
    await act(async () => shareButton()!.click());
    expect(clipboard!.writeText).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("copies instead where there is no share sheet, or it fails", async () => {
    share = undefined;
    render();
    await act(async () => shareButton()!.click());
    expect(clipboard!.writeText).toHaveBeenCalledWith(plain);
    expect(toast.success).toHaveBeenCalledWith("Copied to clipboard.");

    share = vi.fn(async () => Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" })));
    clipboard!.writeText.mockClear();
    await act(async () => shareButton()!.click());
    expect(clipboard!.writeText).toHaveBeenCalledWith(plain);
  });

  it("says so when neither works", async () => {
    share = undefined;
    clipboard = undefined;
    render();
    await act(async () => shareButton()!.click());
    expect(toast.error).toHaveBeenCalledWith("Couldn’t share this reply.");
  });
});
