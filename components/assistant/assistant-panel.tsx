"use client";

import { useCallback, useEffect, useState } from "react";
import { useStrings } from "@/lib/i18n/client";
import { listConversations, listMessages } from "@/lib/data/actions";
import type { Citation } from "@/lib/rag/types";
import type { WebPage } from "@/lib/cite/bibtex";
import type { ChatUIMessage } from "@/lib/chat/types";
import { Button } from "@/components/ui/button";
import { ChatThread } from "./chat-thread";

type Conversation = { id: string; title: string | null; updated_at: string };

type Props = {
  bookId: string;
  bookTitle: string;
  ready: boolean;
  getCurrentHref: () => string | null;
  onCite: (spineHref: string) => void;
  /** Shows a close button (omit when the panel's container has its own). */
  onClose?: () => void;
  /** Text the reader selected or tapped in the book, for the next message. */
  passage?: string | null;
  onPassageUsed?: () => void;
};

// A thread is identified locally by a key; a brand-new chat has no
// conversation id until the server creates one on the first message.
type Thread = { key: string; conversationId: string | null; messages: ChatUIMessage[] };
const newThread = (): Thread => ({ key: crypto.randomUUID(), conversationId: null, messages: [] });

export function AssistantPanel({ bookId, bookTitle, ready, getCurrentHref, onCite, onClose, passage, onPassageUsed }: Props) {
  const t = useStrings();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [thread, setThread] = useState<Thread>(newThread);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    const { data, error } = await listConversations(bookId);
    if (error) {
      // Keep whatever list we had rather than blanking it.
      console.error("load conversations failed", error.message);
      setLoadError(t.loadConversationsFailed(error.message));
      return;
    }
    setLoadError(null);
    setConversations(data ?? []);
  }, [bookId, t]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  async function openConversation(id: string) {
    if (!id) return setThread(newThread());
    setLoadingThread(true);
    const { data, error } = await listMessages(id);
    setLoadingThread(false);
    if (error) {
      // Stay on the current thread instead of opening an empty one.
      console.error("load messages failed", error.message);
      setLoadError(t.loadConversationFailed(error.message));
      return;
    }
    setLoadError(null);
    setThread({
      key: id,
      conversationId: id,
      messages: (data ?? []).map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        parts: [
          { type: "text" as const, text: m.content },
          ...(m.role === "assistant" && Array.isArray(m.citations)
            ? [{ type: "data-citations" as const, data: m.citations as unknown as Citation[] }]
            : []),
          ...(m.role === "assistant" && Array.isArray(m.web_sources)
            ? [{ type: "data-web-sources" as const, data: m.web_sources as unknown as WebPage[] }]
            : []),
        ],
      })),
    });
  }

  const onConversationCreated = useCallback(
    (c: { id: string; title: string }) => {
      // Keep the live thread (and its stream); just record its new id.
      setThread((t) => ({ ...t, conversationId: c.id }));
      setConversations((list) => [{ id: c.id, title: c.title, updated_at: new Date().toISOString() }, ...list]);
    },
    [],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <label className="sr-only" htmlFor="thread-picker">
          {t.conversation}
        </label>
        <select
          id="thread-picker"
          className="h-8 min-w-0 flex-1 truncate rounded-md border bg-background px-2 text-sm"
          value={thread.conversationId ?? ""}
          onChange={(e) => void openConversation(e.target.value)}
          disabled={!ready}
        >
          <option value="">{t.newConversation}</option>
          {conversations.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title ?? t.untitled}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={() => setThread(newThread())} disabled={!ready}>
          {t.newChat}
        </Button>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={t.closeAssistant}>
            ✕
          </Button>
        )}
      </div>

      {loadError && <p className="border-b px-4 py-2 text-sm text-destructive">{loadError}</p>}

      {!ready ? (
        <p className="p-4 text-sm text-muted-foreground">{t.stillIndexing}</p>
      ) : loadingThread ? (
        <p className="p-4 text-sm text-muted-foreground">{t.loadingConversation}</p>
      ) : (
        <ChatThread
          key={thread.key}
          bookId={bookId}
          bookTitle={bookTitle}
          conversationId={thread.conversationId}
          initialMessages={thread.messages}
          getCurrentHref={getCurrentHref}
          onCite={onCite}
          onConversationCreated={onConversationCreated}
          onAnswered={loadConversations}
          passage={passage}
          onPassageUsed={onPassageUsed}
        />
      )}
    </div>
  );
}
