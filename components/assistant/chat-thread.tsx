"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { ChatRequestBody, ChatUIMessage } from "@/lib/chat/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { activityLabel } from "@/lib/chat/activity";
import { MessageView } from "./message-view";

type Props = {
  bookId: string;
  bookTitle: string;
  conversationId: string | null;
  initialMessages: ChatUIMessage[];
  getCurrentHref: () => string | null;
  onCite: (spineHref: string) => void;
  onConversationCreated: (c: { id: string; title: string }) => void;
  onAnswered: () => void;
};

export function ChatThread(props: Props) {
  const { bookId, bookTitle, initialMessages, getCurrentHref, onCite } = props;
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Read at send time; the id arrives from the server on the first answer.
  const conversationId = useRef(props.conversationId);
  conversationId.current = props.conversationId ?? conversationId.current;
  const callbacks = useRef(props);
  callbacks.current = props;

  const transport = useMemo(
    () =>
      new DefaultChatTransport<ChatUIMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages }) => {
          const last = messages.at(-1);
          const text = last?.parts.map((p) => (p.type === "text" ? p.text : "")).join("") ?? "";
          const body: ChatRequestBody = {
            bookId,
            conversationId: conversationId.current,
            message: text,
            currentHref: getCurrentHref(),
          };
          return { body };
        },
      }),
    [bookId, getCurrentHref],
  );

  const { messages, sendMessage, status, stop, error, clearError } = useChat<ChatUIMessage>({
    messages: initialMessages,
    transport,
    onData: (part) => {
      if (part.type === "data-conversation") {
        conversationId.current = part.data.id;
        callbacks.current.onConversationCreated(part.data);
      }
    },
    onFinish: () => callbacks.current.onAnswered(),
  });

  const busy = status === "submitted" || status === "streaming";
  const activity = activityLabel(status, messages.at(-1));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    clearError();
    setInput("");
    void sendMessage({ text });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ask about <span className="italic">{bookTitle}</span>. Answers come only from the book’s text, with
            references to the passages used.
          </p>
        ) : (
          <ol className="grid gap-5">
            {messages.map((m, i) => (
              <li key={m.id}>
                <MessageView
                  message={m}
                  bookTitle={bookTitle}
                  streaming={busy && i === messages.length - 1 && m.role === "assistant"}
                  onCite={onCite}
                />
              </li>
            ))}
          </ol>
        )}
        {activity && <p className="mt-4 text-sm text-muted-foreground">{activity}</p>}
        {error && <p className="mt-4 text-sm text-destructive">{errorMessage(error)}</p>}
        <div ref={bottomRef} />
      </div>

      <form
        className="border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Ask a question about this book
        </label>
        <Textarea
          id="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask a question about this book…"
          rows={2}
          maxLength={4000}
          className="max-h-40 resize-none"
        />
        <div className="mt-2 flex justify-end">
          {busy ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void stop()}>
              Stop
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={!input.trim()}>
              Ask
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

// Errors from the route arrive as the response body ({ error }) or the
// stream's generic message.
function errorMessage(error: Error) {
  try {
    const parsed = JSON.parse(error.message);
    if (typeof parsed?.error === "string") return parsed.error;
  } catch {
    // not JSON
  }
  return error.message || "Something went wrong. Try again.";
}
