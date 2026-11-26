import type { ChatStatus } from "ai";
import type { ChatUIMessage } from "./types";

/**
 * Whether the answer is waiting on a web search: from when the model asks for
 * one until the answer it feeds starts arriving.
 */
export function isSearchingWeb(message: ChatUIMessage | undefined) {
  if (message?.role !== "assistant") return false;
  const lastSearch = message.parts.findLastIndex((p) => p.type === "tool-web_search");
  return lastSearch >= 0 && !hasText({ ...message, parts: message.parts.slice(lastSearch + 1) });
}

/**
 * The thread's status line while an answer is on its way. The passages are
 * found before the reply starts; the book line stays up after that while the
 * model decides whether it needs a web search, until the search or the
 * answer itself begins.
 */
export function activityLabel(status: ChatStatus, last: ChatUIMessage | undefined): "book" | "web" | null {
  if (status === "submitted") return "book";
  if (status !== "streaming") return null;
  if (isSearchingWeb(last)) return "web";
  if (last?.role === "assistant" && !hasText(last)) return "book";
  return null;
}

/** Whether any of the answer has arrived yet. */
export function hasText(message: ChatUIMessage) {
  return message.parts.some((p) => p.type === "text" && p.text);
}
