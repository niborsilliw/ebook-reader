// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Highlight } from "@/lib/notes/types";
import { memoryStorage } from "./helpers/storage";

// The book itself (epub.js) can't run here: a stand-in viewer hands its
// callbacks to the test, which plays the reader's taps through them.
type ViewerProps = {
  onHighlightClick: (id: string) => void;
  onLocation: (loc: object) => void;
  textScale?: number;
  onFrameKeyDown?: (e: KeyboardEvent) => void;
};
const viewer: { props?: ViewerProps } = {};
vi.mock("next/dynamic", () => ({
  default: () => (props: ViewerProps) => {
    viewer.props = props;
    return null;
  },
}));
vi.mock("next/link", () => ({ default: (props: object) => <a {...props} /> }));
// Every Supabase query comes back empty.
vi.mock("@/lib/supabase/browser", () => {
  const empty = { data: [], error: null };
  const query: object = new Proxy(() => {}, {
    get: (_, key) => (key === "then" ? (resolve: (v: typeof empty) => void) => resolve(empty) : () => query),
  });
  return { createClient: () => query };
});

const { ReaderShell } = await import("@/components/reader/reader-shell");

const OLD: Highlight = {
  id: "h1",
  cfi_range: "epubcfi(/6/4!/4/2,/1:0,/1:20)",
  text: "Maman died today. Or yesterday maybe, I don't know.",
  note: null,
  color: "yellow",
  chapter_title: "Part One",
  verified: false,
  created_at: "2026-01-01T00:00:00Z",
};

let root: Root;
let container: HTMLDivElement;
let requests: { message: string }[];

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  localStorage.setItem("reader:text-size", "large");
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = () => {};
  requests = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    return new Response("", { status: 500 });
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <ReaderShell
        bookId="22222222-2222-4222-8222-222222222222"
        userId="u"
        title="The Stranger"
        author="Albert Camus"
        publication={{ publisher: null, published: null, isbn: null }}
        fileUrl="/book.epub"
        initialCfi={null}
        initialPositionAt={null}
        toc={[]}
        ready
        initialHighlights={[OLD]}
        initialBookmarks={[]}
      />,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const tab = (name: string) => container.querySelector<HTMLButtonElement>(`#tab-${name}`)!;
const attached = () => container.querySelector("#tabpanel-assistant form p")?.textContent?.replace("Asking about: ", "") ?? null;

async function ask(question: string) {
  const input = container.querySelector<HTMLTextAreaElement>("#chat-input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, question);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    container.querySelector<HTMLFormElement>("#tabpanel-assistant form")!.requestSubmit();
    await new Promise((r) => setTimeout(r, 20));
  });
}

describe("asking the assistant about an existing highlight", () => {
  it("taps the highlight, opens the assistant, finds it attached, and sends it with the question", async () => {
    act(() => viewer.props!.onHighlightClick("h1"));
    expect(tab("notes").getAttribute("aria-selected")).toBe("true"); // the note opens, as before

    act(() => tab("assistant").click());
    expect(attached()).toBe(OLD.text);
    expect(container.querySelector("#chat-input")!.getAttribute("placeholder")).toBe("Ask about this passage…");

    await ask("Tell me more about this");
    expect(requests).toHaveLength(1);
    expect(requests[0].message).toBe(`> ${OLD.text}\n\nTell me more about this`);
    expect(attached()).toBeNull(); // used up by the question
  });

  it("does the same for a highlight opened from the notes list", () => {
    act(() => viewer.props!.onHighlightClick("h1"));
    act(() => container.querySelector<HTMLButtonElement>('#tabpanel-assistant form button[aria-label^="Don’t ask"]')!.click());
    expect(attached()).toBeNull();

    const item = [...container.querySelectorAll<HTMLElement>("#tabpanel-notes button")].find((b) =>
      b.textContent?.includes("Maman died today"),
    )!;
    act(() => item.click());
    act(() => tab("assistant").click());
    expect(attached()).toBe(OLD.text);
  });
});

describe("the Aa button", () => {
  const aa = () => container.querySelector<HTMLButtonElement>('button[aria-label^="Text size"]')!;

  it("opens at the size saved in this browser, and cycles through the three sizes, saving each", () => {
    expect(viewer.props!.textScale).toBe(1.1);
    expect(aa().title).toBe("Text size: Large");

    act(() => aa().click());
    expect(viewer.props!.textScale).toBe(0.9);
    expect(aa().title).toBe("Text size: Small");
    expect(localStorage.getItem("reader:text-size")).toBe("small");

    act(() => aa().click());
    expect(viewer.props!.textScale).toBe(1);
    act(() => aa().click());
    expect(viewer.props!.textScale).toBe(1.1);
    expect(localStorage.getItem("reader:text-size")).toBe("large");
  });

  it("sits in the drawer's header beside the Notes and Assistant tabs", () => {
    expect(aa().closest('[role="tablist"]')).not.toBeNull();
  });
});

describe("summoning the drawers", () => {
  const open = (id: string) => !container.ownerDocument.getElementById(id)!.hasAttribute("inert");
  const press = (init: KeyboardEventInit, target: EventTarget = window) => {
    const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    act(() => void target.dispatchEvent(e));
    return e;
  };

  it("⌘/ toggles the assistant, switching to its tab if the notes are showing", () => {
    expect(press({ key: "/", code: "Slash", metaKey: true }).defaultPrevented).toBe(true);
    expect(open("notes-drawer")).toBe(true);
    expect(tab("assistant").getAttribute("aria-selected")).toBe("true");
    press({ key: "/", code: "Slash", metaKey: true });
    expect(open("notes-drawer")).toBe(false);

    act(() => tab("notes").click());
    press({ key: "/", code: "Slash", ctrlKey: true });
    expect(open("notes-drawer")).toBe(true);
    expect(tab("assistant").getAttribute("aria-selected")).toBe("true");
  });

  it("⌘⇧H toggles the notes, also when pressed inside the book's iframe", () => {
    press({ key: "H", code: "KeyH", metaKey: true, shiftKey: true });
    expect(open("notes-drawer")).toBe(true);
    expect(tab("notes").getAttribute("aria-selected")).toBe("true");
    const e = new KeyboardEvent("keydown", { key: "H", code: "KeyH", metaKey: true, shiftKey: true, cancelable: true });
    act(() => viewer.props!.onFrameKeyDown!(e));
    expect(e.defaultPrevented).toBe(true);
    expect(open("notes-drawer")).toBe(false);
  });

  it("leaves other key presses alone", () => {
    expect(press({ key: "/" }).defaultPrevented).toBe(false);
    expect(press({ key: "h", code: "KeyH", metaKey: true }).defaultPrevented).toBe(false);
    expect(open("contents-drawer") || open("notes-drawer")).toBe(false);
  });

  it("opens each drawer from its corner button", () => {
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Contents and library"]')!.click());
    expect(open("contents-drawer")).toBe(true);
    // The buttons go while a drawer is open, and come back when it closes.
    expect(container.querySelector('button[aria-label="Notes and assistant"]')).toBeNull();
    press({ key: "Escape" });
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Notes and assistant"]')!.click());
    expect(open("notes-drawer")).toBe(true);
  });
});
