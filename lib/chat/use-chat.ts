"use client";

// The assistant's side of /api/chat: sends a question and builds the answer
// as it streams in. The route speaks the AI SDK's UI message stream (server-
// sent events, one JSON chunk per `data:` line); this reads the handful of
// chunk types Nancy uses, so the browser needs no AI library.

import { useCallback, useRef, useState } from "react";
import type { ChatStatus } from "ai";
import type { ChatDataParts, ChatRequestBody, ChatUIMessage } from "./types";

type Part = ChatUIMessage["parts"][number];
type DataPart = { [K in keyof ChatDataParts]: { type: `data-${K}`; data: ChatDataParts[K] } }[keyof ChatDataParts];

// The fields of the chunks Nancy reads; the rest are ignored.
type Chunk = { type: string; delta?: string; toolName?: string; errorText?: string; data?: unknown; transient?: boolean };

type Options = {
  initialMessages: ChatUIMessage[];
  body: (text: string) => ChatRequestBody;
  onData?: (part: DataPart) => void;
  onFinish?: () => void;
};

export function useChat({ initialMessages, body, onData, onFinish }: Options) {
  const [messages, setMessages] = useState(initialMessages);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [error, setError] = useState<Error | null>(null);
  const abort = useRef<AbortController | null>(null);
  const opts = useRef({ body, onData, onFinish });
  opts.current = { body, onData, onFinish };

  const send = useCallback(async (text: string) => {
    const question: ChatUIMessage = { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] };
    let answer: ChatUIMessage = { id: crypto.randomUUID(), role: "assistant", parts: [] };
    const show = () => setMessages((list) => [...list.filter((m) => m.id !== answer.id), answer]);
    const update = (parts: Part[]) => {
      answer = { ...answer, parts };
      show();
    };

    setMessages((list) => [...list, question]);
    setError(null);
    setStatus("submitted");
    abort.current = new AbortController();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts.current.body(text)),
        signal: abort.current.signal,
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      setStatus("streaming");
      show();

      for await (const chunk of chunks(res.body)) {
        const parts = answer.parts;
        if (chunk.type === "text-start") update([...parts, { type: "text", text: "" }]);
        else if (chunk.type === "text-delta") {
          const last = parts.at(-1);
          if (last?.type === "text") update([...parts.slice(0, -1), { ...last, text: last.text + chunk.delta }]);
        }
        // Only its presence matters: it shows "Searching the web…".
        else if (chunk.type === "tool-input-start") update([...parts, { type: `tool-${chunk.toolName}` } as Part]);
        else if (chunk.type === "error") throw new Error(chunk.errorText);
        else if (chunk.type.startsWith("data-")) {
          const part = { type: chunk.type, data: chunk.data } as DataPart;
          opts.current.onData?.(part);
          if (!chunk.transient) update([...parts, part]);
        }
      }
      setStatus("ready");
      opts.current.onFinish?.();
    } catch (err) {
      if (abort.current?.signal.aborted) return setStatus("ready");
      setError(err instanceof Error ? err : new Error(String(err)));
      setStatus("error");
    }
  }, []);

  const stop = useCallback(() => abort.current?.abort(), []);
  const clearError = useCallback(() => setError(null), []);

  return { messages, send, status, stop, error, clearError };
}

/** The stream's JSON chunks, one per `data:` line, until `[DONE]`. */
async function* chunks(body: ReadableStream<Uint8Array>): AsyncGenerator<Chunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") return;
      yield JSON.parse(data) as Chunk;
    }
  }
}
