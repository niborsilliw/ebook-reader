// The companion's "librarian": a web search through Exa, used only when the
// reader asks for context from outside the book (see the companion prompt).

import { stepCountIs, tool } from "ai";
import { z } from "zod";

const SEARCH_URL = "https://api.exa.ai/search";
const NUM_RESULTS = 5;
const MAX_CHARS_PER_RESULT = 1500;
const REQUEST_TIMEOUT_MS = 15_000;
// Model steps per answer: a search, perhaps a second, then the answer.
const MAX_STEPS = 3;

export type WebResult = { title: string; url: string; publishedDate?: string; author?: string; text: string };

type Options = { apiKey?: string; fetch?: typeof fetch };

/** Searches the web with Exa and returns each result with an extract of its text. */
export async function searchWeb(query: string, opts: Options = {}): Promise<WebResult[]> {
  const apiKey = opts.apiKey ?? process.env.EXA_API_KEY;
  if (!apiKey) throw new Error("EXA_API_KEY is not set");
  const res = await (opts.fetch ?? fetch)(SEARCH_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({
      query,
      numResults: NUM_RESULTS,
      contents: { text: { maxCharacters: MAX_CHARS_PER_RESULT } },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Exa search failed: ${res.status}`);
  const body = (await res.json()) as { results?: Partial<WebResult>[] };
  return (body.results ?? []).flatMap((r) =>
    r.url
      ? [{ title: r.title || r.url, url: r.url, publishedDate: r.publishedDate, author: r.author, text: (r.text ?? "").trim() }]
      : [],
  );
}

/** Results as the model sees them: each page's address, then its text. */
export function formatWebResults(results: WebResult[]) {
  if (!results.length) return "(The web search found nothing.)";
  return results
    .map((r) => {
      const byline = [r.author, r.publishedDate?.slice(0, 10)].filter(Boolean).join(", ");
      const attrs = `url="${escapeAttr(r.url)}" title="${escapeAttr(r.title)}"${byline ? ` byline="${escapeAttr(byline)}"` : ""}`;
      return `<web_result ${attrs}>\n${sanitize(r.text)}\n</web_result>`;
    })
    .join("\n\n");
}

function sanitize(text: string) {
  // Keep page text from closing or opening result tags.
  return text.replace(/<\/?web_result\b/gi, (m) => m.replace("<", "‹"));
}

function escapeAttr(s: string) {
  return s.replace(/"/g, "'");
}

const webSearchTool = tool({
  description:
    "Search the web. Required for any factual question about something outside this book: another writer or person, a historical event, a place, a date, or a request to look something up. Not for questions about the book itself.",
  inputSchema: z.object({ query: z.string().min(1).max(300).describe("What to search for, as a short search query") }),
  execute: async ({ query }) => {
    try {
      const results = await searchWeb(query);
      // So whoever runs the server can see when the companion went outside the book.
      console.info(`web search: ${JSON.stringify(query)} → ${results.length} results`);
      return formatWebResults(results);
    } catch (err) {
      console.error("web search failed", (err as Error).message);
      return "(The web search failed. Answer from what you know, and say that you couldn't search.)";
    }
  },
});

// A short reply asking for a search, or accepting one the companion offered.
const SEARCH_REQUEST = /\b(look (it|that|this|them) up|search (for )?(it|that|this|the web|online)|google it|check online)\b/i;
const ASSENT = /^\W*(yes|yeah|yep|yup|sure|ok(ay)?|please|go (ahead|for it)|do it|do that|please do)\b/i;
const OFFERED_SEARCH = /\b(search|look (it|that|this|them) up|look up|check online)\b/i;
const SHORT_REPLY_CHARS = 60;

/**
 * Whether the reader's message asks for a search outright ("look it up") or
 * accepts one the companion just offered ("yes please do"). Then the search
 * is made for certain, not left to the model.
 */
export function wantsSearch(message: string, previousReply?: string) {
  const m = message.trim();
  if (m.length > SHORT_REPLY_CHARS) return false;
  return SEARCH_REQUEST.test(m) || (ASSENT.test(m) && OFFERED_SEARCH.test(previousReply ?? ""));
}

/**
 * streamText options that give the model web_search. The SDK runs the loop:
 * a web_search call is executed and its results go back to the model, which
 * then streams the answer. With `force` the first step must search. The last
 * step has no tools, so it always ends in an answer.
 */
export function webSearchOptions({ force = false } = {}) {
  return {
    tools: { web_search: webSearchTool },
    stopWhen: stepCountIs(MAX_STEPS),
    prepareStep: ({ stepNumber }: { stepNumber: number }) =>
      stepNumber === MAX_STEPS - 1
        ? { activeTools: [] }
        : force && stepNumber === 0
          ? { toolChoice: { type: "tool" as const, toolName: "web_search" as const } }
          : {},
  };
}
