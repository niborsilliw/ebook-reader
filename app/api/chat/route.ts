import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createUIMessageStream, createUIMessageStreamResponse, streamText, type UIMessageStreamWriter } from "ai";
import { mistral } from "@ai-sdk/mistral";
import { z } from "zod";
import { createClient, getUserId } from "@/lib/supabase/server";
import { embedTexts } from "@/lib/mistral";
import { buildRetrievalQuery, retrieveSources, type MatchRow } from "@/lib/rag/retrieve";
import { buildPrompt, citationsFor, conversationTitle, HISTORY_MESSAGES, promptMode } from "@/lib/rag/prompt";
import { toCitation } from "@/lib/rag/types";
import type { ChatUIMessage } from "@/lib/chat/types";
import { chatErrorMessage, upstreamStatus } from "@/lib/chat/errors";

export const maxDuration = 60;

const PROMPT_MODE = promptMode(process.env.CHAT_PROMPT_MODE);
// Companion answers come from Claude; grounded answers stay on Mistral.
const USE_CLAUDE = PROMPT_MODE === "companion";
const CHAT_MODEL = USE_CLAUDE
  ? process.env.ANTHROPIC_CHAT_MODEL || "claude-haiku-4-5"
  : process.env.MISTRAL_CHAT_MODEL || "mistral-medium-latest";
const TEMPERATURE = USE_CLAUDE ? 0.6 : 0.2;
const CLAUDE_MAX_TOKENS = 16000;

const Body = z.object({
  bookId: z.uuid(),
  conversationId: z.uuid().nullish(),
  message: z.string().trim().min(1).max(4000),
  currentHref: z.string().max(1000).nullish(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!(await getUserId(supabase))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (USE_CLAUDE && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Chat isn't configured: ANTHROPIC_API_KEY is missing." }, { status: 500 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { bookId, message, currentHref } = parsed.data;
  let conversationId = parsed.data.conversationId ?? null;

  // Everything below runs as the user, so RLS scopes books, chunks,
  // conversations and messages to their own.
  const { data: book } = await supabase.from("books").select("id, title, status").eq("id", bookId).maybeSingle();
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (book.status !== "ready") {
    return NextResponse.json({ error: "This book is still being indexed." }, { status: 409 });
  }
  const bookTitle = book.title ?? "this book";

  let history: { role: "user" | "assistant"; content: string }[] = [];
  if (conversationId) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("book_id", bookId)
      .maybeSingle();
    if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    const { data: rows } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_MESSAGES);
    history = (rows ?? []).reverse().map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
  }

  // Retrieve before writing anything, so a Mistral/DB failure leaves no
  // half-created conversation or unanswered message behind.
  let sources;
  try {
    const previousQuestion = history.filter((m) => m.role === "user").at(-1)?.content;
    sources = await retrieveSources(
      {
        embedQuery: async (text) => (await embedTexts([text]))[0],
        matchChunks: async (id, embedding, k) => {
          const { data, error } = await supabase.rpc("match_chunks", {
            p_book_id: id,
            p_embedding: JSON.stringify(embedding),
            p_k: k,
          });
          if (error) throw new Error(`match_chunks: ${error.message}`);
          return (data ?? []) as MatchRow[];
        },
      },
      { bookId, query: buildRetrievalQuery(message, previousQuestion), currentHref },
    );
  } catch (err) {
    console.error("chat retrieval failed", (err as Error).message);
    const rateLimited = upstreamStatus(err) === 429;
    return NextResponse.json(
      { error: rateLimited ? chatErrorMessage(err) : "Couldn't search this book right now. Try again." },
      { status: rateLimited ? 503 : 502 },
    );
  }

  let createdTitle: string | null = null;
  if (!conversationId) {
    createdTitle = conversationTitle(message);
    const { data: created, error } = await supabase
      .from("conversations")
      .insert({ book_id: bookId, title: createdTitle })
      .select("id")
      .single();
    if (error || !created) return NextResponse.json({ error: "Could not start a conversation" }, { status: 500 });
    conversationId = created.id;
  }

  const { error: userMsgError } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role: "user", content: message });
  if (userMsgError) return NextResponse.json({ error: "Could not save your message" }, { status: 500 });

  const prompt = buildPrompt({ bookTitle, sources, history, question: message, mode: PROMPT_MODE });
  const convId = conversationId;

  const stream = createUIMessageStream<ChatUIMessage>({
    execute: async ({ writer }) => {
      if (createdTitle) {
        writer.write({ type: "data-conversation", data: { id: convId, title: createdTitle }, transient: true });
      }
      writer.write({ type: "data-citations", data: sources.map(toCitation) });

      let text: string;
      if (USE_CLAUDE) {
        text = await streamClaude(writer, prompt);
      } else {
        const result = streamText({
          model: mistral(CHAT_MODEL),
          system: prompt.system,
          messages: prompt.messages,
          temperature: TEMPERATURE,
        });
        writer.merge(result.toUIMessageStream<ChatUIMessage>());
        text = await result.text;
      }

      // Persist once the full answer is known; the stream stays open until then.
      const [{ error: saveError }] = await Promise.all([
        supabase.from("messages").insert({
          conversation_id: convId,
          role: "assistant",
          content: text,
          citations: citationsFor(text, sources),
          model: CHAT_MODEL,
        }),
        supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId),
      ]);
      if (saveError) console.error("save assistant message failed", saveError.message);
    },
    onError: (err) => {
      console.error("chat stream failed", err instanceof Error ? err.message : err);
      return chatErrorMessage(err);
    },
  });

  return createUIMessageStreamResponse({ stream });
}

/** Streams Claude's answer as the same UI message chunks streamText produces, and returns the full text. */
async function streamClaude(
  writer: UIMessageStreamWriter<ChatUIMessage>,
  prompt: { system: string; messages: Anthropic.MessageParam[] },
) {
  const stream = new Anthropic().messages.stream({
    model: CHAT_MODEL,
    max_tokens: CLAUDE_MAX_TOKENS,
    temperature: TEMPERATURE,
    system: prompt.system,
    messages: prompt.messages,
  });
  const id = crypto.randomUUID();
  writer.write({ type: "start" });
  writer.write({ type: "text-start", id });
  stream.on("text", (delta) => writer.write({ type: "text-delta", id, delta }));
  const message = await stream.finalMessage();
  writer.write({ type: "text-end", id });
  writer.write({ type: "finish" });
  return message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
}
