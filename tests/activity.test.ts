import { describe, expect, it } from "vitest";
import { activityLabel, isSearchingWeb } from "@/lib/chat/activity";
import type { ChatUIMessage } from "@/lib/chat/types";

const assistant = (...parts: unknown[]) => ({ id: "a", role: "assistant", parts }) as ChatUIMessage;
const search = (state: string) => ({ type: "tool-web_search", toolCallId: "t", state, input: { query: "Arendt" } });
const text = (t: string) => ({ type: "text", text: t });

describe("the thread's status line", () => {
  it("says it is searching the book until the reply starts", () => {
    expect(activityLabel("submitted", { id: "u", role: "user", parts: [text("Who is Arendt?")] } as ChatUIMessage)).toBe("Searching the book…");
  });

  it("says it is searching the web from the search request until the answer starts", () => {
    for (const state of ["input-streaming", "input-available", "output-available"]) {
      expect(activityLabel("streaming", assistant({ type: "step-start" }, search(state)))).toBe("Searching the web…");
    }
    expect(activityLabel("streaming", assistant(search("output-available"), { type: "step-start" }, text("")))).toBe("Searching the web…");
    expect(activityLabel("streaming", assistant(search("output-available"), { type: "step-start" }, text("Hannah")))).toBeNull();
  });

  it("keeps saying it is searching the book after the reply starts, until a search or the answer begins", () => {
    expect(activityLabel("streaming", assistant({ type: "data-citations", data: [] }))).toBe("Searching the book…");
    expect(activityLabel("streaming", assistant({ type: "data-citations", data: [] }, { type: "step-start" }, text("")))).toBe("Searching the book…");
    expect(activityLabel("streaming", assistant({ type: "data-citations", data: [] }, { type: "step-start" }, search("input-streaming")))).toBe("Searching the web…");
  });

  it("says nothing while an answer streams without a search, or once it is done", () => {
    expect(activityLabel("streaming", assistant(text("Meursault")))).toBeNull();
    expect(activityLabel("ready", assistant(search("output-available")))).toBeNull();
  });

  it("notices a second search after some text", () => {
    expect(isSearchingWeb(assistant(text("Let me check."), search("input-available")))).toBe(true);
  });
});
