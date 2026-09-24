"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { Citation } from "@/lib/rag/types";
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
  onClose: () => void;
};

// A thread is identified locally by a key; a brand-new chat has no
// conversation id until the server creates one on the first message.
type Thread = { key: string; conversationId: string | null; messages: ChatUIMessage[] };
const newThread = (): Thread => ({ key: crypto.randomUUID(), conversationId: null, messages: [] });

export function AssistantPanel({ bookId, bookTitle, ready, getCurrentHref, onCite, onClose }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [thread, setThread] = useState<Thread>(newThread);
  const [loadingThread, setLoadingThread] = useState(false);

  const loadConversations = useCallback(async () => {
    const { data } = await createClient()
      .from("conversations")
      .select("id, title, updated_at")
      .eq("book_id", bookId)
      .order("updated_at", { ascending: false });
    setConversations(data ?? []);
  }, [bookId]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  async function openConversation(id: string) {
    if (!id) return setThread(newThread());
    setLoadingThread(true);
    const { data } = await createClient()
      .from("messages")
      .select("id, role, content, citations")
      .eq("conversation_id", id)
      .order("created_at");
    setLoadingThread(false);
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
          Conversation
        </label>
        <select
          id="thread-picker"
          className="h-8 min-w-0 flex-1 truncate rounded-md border bg-background px-2 text-sm"
          value={thread.conversationId ?? ""}
          onChange={(e) => void openConversation(e.target.value)}
          disabled={!ready}
        >
          <option value="">New conversation</option>
          {conversations.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title ?? "Untitled"}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={() => setThread(newThread())} disabled={!ready}>
          New chat
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close assistant">
          ✕
        </Button>
      </div>

      {!ready ? (
        <p className="p-4 text-sm text-muted-foreground">
          This book is still being indexed. The assistant will be available when it’s ready.
        </p>
      ) : loadingThread ? (
        <p className="p-4 text-sm text-muted-foreground">Loading conversation…</p>
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
        />
      )}
    </div>
  );
}
