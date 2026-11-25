// Side-by-side test of Mistral models on real Nancy questions.
// Skipped in normal test runs. Run with:
//   RUN_COMPARE=1 npx vitest run tests/model-compare
// Writes model-compare.md in the repo root.
import { test } from "vitest";
import { writeFileSync } from "node:fs";
import { generateText } from "ai";
import { mistral } from "@ai-sdk/mistral";
import { createClient } from "@supabase/supabase-js";
import { embedTexts } from "@/lib/mistral";
import { retrieveSources, type MatchRow } from "@/lib/rag/retrieve";
import { buildPrompt } from "@/lib/rag/prompt";
import { webSearchOptions } from "@/lib/rag/web-search";

const BOOK_ID = "0de49286-1cc6-491a-b108-a0f950f7e57f"; // Robin's The Stranger
const MODELS = ["mistral-medium-latest", "mistral-large-2512", "mistral-small-latest"];
const QUESTIONS = [
  "bier",
  "maman",
  "Who is Raymond?",
  "What happens at the funeral?",
  "Why does Meursault shoot the Arab?",
  "What does the chaplain want from him?",
  "Is Meursault a nihilist?",
  "What did Camus himself say about Meursault in his later preface?",
];

test.runIf(process.env.RUN_COMPARE === "1")("compare models", { timeout: 900_000 }, async () => {
  process.loadEnvFile(".env.local");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const out: string[] = [`# Model comparison: The Stranger\n\n*${new Date().toISOString()}*\n`];
  const totals: Record<string, { ms: number; inTok: number; outTok: number }> = {};

  for (const q of QUESTIONS) {
    const sources = await retrieveSources(
      {
        embedQuery: async (t) => (await embedTexts([t]))[0],
        matchChunks: async (id, emb, k) => {
          const { data, error } = await db.rpc("match_chunks", { p_book_id: id, p_embedding: JSON.stringify(emb), p_k: k });
          if (error) throw error;
          return (data ?? []) as MatchRow[];
        },
      },
      { bookId: BOOK_ID, query: q },
    );
    const prompt = buildPrompt({ bookTitle: "The Stranger", sources, history: [], question: q, mode: "companion", webSearch: true });
    out.push(`\n## "${q}"\n`);
    for (const model of MODELS) {
      const t0 = Date.now();
      let text: string;
      try {
        const r = await generateText({ model: mistral(model), system: prompt.system, messages: prompt.messages, temperature: 0.6, ...webSearchOptions() });
        text = r.steps.map((s) => s.text).join("");
        const ms = Date.now() - t0;
        const u = r.totalUsage;
        const searches = r.steps.reduce((n, s) => n + (s.toolResults?.length ?? 0), 0);
        const t = (totals[model] ??= { ms: 0, inTok: 0, outTok: 0 });
        t.ms += ms; t.inTok += u.inputTokens ?? 0; t.outTok += u.outputTokens ?? 0;
        out.push(`### ${model}\n*${(ms / 1000).toFixed(1)} s · ${u.inputTokens} in / ${u.outputTokens} out · ${searches} web searches*\n\n${text.trim()}\n`);
      } catch (e) {
        out.push(`### ${model}\n**Error:** ${(e as Error).message}\n`);
      }
    }
  }
  out.splice(1, 0, "\n| Model | Total time | Tokens in | Tokens out |\n|---|---|---|---|\n" +
    Object.entries(totals).map(([m, t]) => `| ${m} | ${(t.ms / 1000).toFixed(0)} s | ${t.inTok} | ${t.outTok} |`).join("\n") + "\n");
  writeFileSync("model-compare.md", out.join("\n"));
});
