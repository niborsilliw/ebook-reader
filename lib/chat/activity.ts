import type { ChatStatus } from "ai";
import type { ChatUIMessage } from "./types";

/**
 * Whether the answer is waiting on a web search: from when the model asks for
 * one until the answer it feeds starts arriving.
 */
export function isSearchingWeb(message: ChatUIMessage | undefined) {
  if (message?.role !== "assistant") return false;
  const lastSearch = message.parts.findLastIndex((p) => p.type === "tool-web_search");
  return lastSearch >= 0 && !message.parts.slice(lastSearch + 1).some((p) => p.type === "text" && p.text);
}

/**
 * The thread's status line while an answer is on its way: the passages are
 * found before the reply starts, and a web search, if the reader asked for
 * one, happens during it.
 */
export function activityLabel(status: ChatStatus, last: ChatUIMessage | undefined) {
  if (status === "submitted") return "Searching the book…";
  if (status === "streaming" && isSearchingWeb(last)) return "Searching the web…";
  return null;
}
