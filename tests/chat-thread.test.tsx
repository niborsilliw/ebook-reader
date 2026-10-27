// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChatThread } from "@/components/assistant/chat-thread";

// The /api/chat stream for an answer that searches the web, in the order the
// server sends it (recorded from the route; ids and text shortened).
const WEB_ANSWER = [
  { type: "data-citations", data: [] },
  { type: "start" },
  { type: "start-step" },
  { type: "tool-input-start", toolCallId: "t1", toolName: "web_search" },
  { type: "tool-input-delta", toolCallId: "t1", inputTextDelta: '{"query":"Hannah Arendt"}' },
  { type: "tool-input-available", toolCallId: "t1", toolName: "web_search", input: { query: "Hannah Arendt" } },
  { type: "tool-output-available", toolCallId: "t1", output: "<web_result …>" },
  { type: "finish-step" },
  { type: "start-step" },
  { type: "text-start", id: "x" },
  { type: "text-delta", id: "x", delta: "Hannah Arendt was a political theorist (https://plato.stanford.edu/entries/arendt/)." },
  { type: "text-end", id: "x" },
  { type: "finish-step" },
  { type: "finish" },
];
const BOOK_ANSWER = [
  { type: "data-citations", data: [] },
  { type: "start" },
  { type: "start-step" },
  { type: "text-start", id: "x" },
  { type: "text-delta", id: "x", delta: "He won't perform a grief he doesn't feel." },
  { type: "text-end", id: "x" },
  { type: "finish-step" },
  { type: "finish" },
];

let root: Root;
let container: HTMLDivElement;
let send: (event: object | "[DONE]") => Promise<void>;
let respond: () => Promise<void>;

beforeEach(() => {
  // React's act() needs this outside a test renderer.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = () => {};
  // The response is held until respond(), then fed one event at a time by
  // send(), so each state the reader can see is checked in turn.
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let release!: () => void;
  const released = new Promise<void>((r) => (release = r));
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
  vi.stubGlobal("fetch", async () => {
    await released;
    return new Response(body, { headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } });
  });
  const settle = () => act(() => new Promise((r) => setTimeout(r, 20)));
  respond = async () => {
    release();
    await settle();
  };
  send = async (event) => {
    controller.enqueue(new TextEncoder().encode(`data: ${event === "[DONE]" ? event : JSON.stringify(event)}\n\n`));
    if (event === "[DONE]") controller.close();
    await settle();
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function ask(question: string) {
  act(() => {
    root.render(
      <ChatThread
        bookId="22222222-2222-4222-8222-222222222222"
        bookTitle="The Stranger"
        conversationId={null}
        initialMessages={[]}
        getCurrentHref={() => null}
        onCite={() => {}}
        onConversationCreated={() => {}}
        onAnswered={() => {}}
      />,
    );
  });
  const input = container.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, question);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    container.querySelector("form")!.requestSubmit();
    await new Promise((r) => setTimeout(r, 20));
  });
}

const statusLine = () => [...container.querySelectorAll("p")].map((p) => p.textContent).find((t) => t?.startsWith("Searching")) ?? null;

describe("the assistant's status line, as the reader sees it", () => {
  it("says it is searching the book, then the web, then gives way to the answer", async () => {
    await ask("Who is Hannah Arendt?");
    expect(statusLine()).toBe("Searching the book…"); // waiting for the response

    await respond();
    const seen: (string | null)[] = [];
    for (const event of WEB_ANSWER) {
      await send(event);
      seen.push(statusLine());
    }
    await send("[DONE]");

    const at = (type: string) => seen[WEB_ANSWER.findIndex((e) => e.type === type)];
    expect(at("data-citations")).toBe("Searching the book…");
    expect(at("tool-input-start")).toBe("Searching the web…");
    expect(at("tool-output-available")).toBe("Searching the web…");
    expect(at("text-delta")).toBeNull();
    expect(statusLine()).toBeNull();
    expect(container.textContent).toContain("plato.stanford.edu");
  });

  it("never says it is searching the web for an answer from the book", async () => {
    await ask("Why doesn't Meursault cry?");
    await respond();
    const seen = new Set<string | null>(["Searching the book…"]);
    for (const event of BOOK_ANSWER) {
      await send(event);
      seen.add(statusLine());
    }
    expect(seen).toEqual(new Set(["Searching the book…", null]));
  });
});
