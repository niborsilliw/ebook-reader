import type { UIMessage } from "ai";
import type { Citation } from "@/lib/rag/types";
import type { WebPage } from "@/lib/cite/bibtex";

export type ChatDataParts = {
  /** Sources retrieved for this answer; the UI shows the ones the text cites. */
  citations: Citation[];
  /** Sent (transient) when the first message creates a conversation. */
  conversation: { id: string; title: string };
  /** Pages the answer's web searches returned, for "Cite" on web sources. */
  "web-sources": WebPage[];
};

export type ChatUIMessage = UIMessage<never, ChatDataParts>;

export type ChatRequestBody = {
  bookId: string;
  conversationId: string | null;
  message: string;
  currentHref?: string | null;
};
