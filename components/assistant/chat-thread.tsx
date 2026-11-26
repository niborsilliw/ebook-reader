"use client";

import { useEffect, useRef, useState } from "react";
import { useStrings } from "@/lib/i18n/client";
import type { ChatUIMessage } from "@/lib/chat/types";
import { useChat } from "@/lib/chat/use-chat";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { activityLabel } from "@/lib/chat/activity";
import { withPassage } from "@/lib/chat/passage";
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
  /** Text the reader selected or tapped in the book; goes with the next message. */
  passage?: string | null;
  onPassageUsed?: () => void;
};

export function ChatThread(props: Props) {
  const { bookId, bookTitle, initialMessages, getCurrentHref, onCite, passage, onPassageUsed } = props;
  const t = useStrings();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Read at send time; the id arrives from the server on the first answer.
  const conversationId = useRef(props.conversationId);
  conversationId.current = props.conversationId ?? conversationId.current;
  const callbacks = useRef(props);
  callbacks.current = props;

  const { messages, send, status, stop, error, clearError } = useChat({
    initialMessages,
    body: (message) => ({
      bookId,
      conversationId: conversationId.current,
      message,
      currentHref: getCurrentHref(),
    }),
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
    onPassageUsed?.();
    void send(withPassage(passage, text));
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
        {activity && <p className="mt-4 text-sm text-muted-foreground">{activity === "web" ? t.searchingWeb : t.searchingBook}</p>}
        {error && <p className="mt-4 text-sm text-destructive">{errorMessage(error, t.somethingWrong)}</p>}
        <div ref={bottomRef} />
      </div>

      <form
        className="border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {passage && (
          <div className="mb-2 flex items-start gap-2 rounded-md border-l-2 border-[#c9bfae] bg-muted/60 py-1.5 pr-1 pl-2.5">
            <p className="line-clamp-3 min-w-0 flex-1 font-serif text-sm italic text-[#4a453e]">
              <span className="sr-only">{t.askingAbout} </span>
              {passage}
            </p>
            <button
              type="button"
              onClick={onPassageUsed}
              aria-label={t.dontAskAboutPassage}
              title={t.dontAskAboutPassage}
              className="grid size-6 shrink-0 place-items-center rounded text-[#8c8478] hover:bg-black/5 hover:text-[#1f1d1a]"
            >
              ✕
            </button>
          </div>
        )}
        <label htmlFor="chat-input" className="sr-only">
          {t.askQuestion}
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
          placeholder={passage ? t.askPassagePlaceholder : t.askPlaceholder}
          rows={2}
          maxLength={4000}
          className="max-h-40 resize-none"
        />
        <div className="mt-2 flex justify-end">
          {busy ? (
            <Button type="button" variant="outline" size="sm" onClick={stop}>
              {t.stop}
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={!input.trim()}>
              {t.ask}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

// Errors from the route arrive as the response body ({ error }) or the
// stream's generic message.
function errorMessage(error: Error, fallback: string) {
  try {
    const parsed = JSON.parse(error.message);
    if (typeof parsed?.error === "string") return parsed.error;
  } catch {
    // not JSON
  }
  return error.message || fallback;
}
