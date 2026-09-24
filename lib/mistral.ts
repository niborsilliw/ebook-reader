import { estimateTokens } from "@/lib/ingest/chunk";

const EMBEDDINGS_URL = "https://api.mistral.ai/v1/embeddings";
export const EMBED_MODEL = process.env.MISTRAL_EMBED_MODEL || "mistral-embed";
export const EMBED_DIMENSIONS = 1024;

// Mistral caps total tokens per embeddings request. Our token count is an
// estimate, so stay well under; a 400 still triggers a split-and-retry.
const MAX_REQUEST_TOKENS = 8_000;
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 20_000;

export class MistralError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** Worth retrying later (rate limit, server error, network). */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "MistralError";
  }
}

type Options = {
  apiKey?: string;
  model?: string;
  /** Epoch ms. No retry wait is started that would end past this. */
  deadline?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

/**
 * Embeds texts with mistral-embed, splitting into requests that fit the
 * per-request token cap. Returns one 1024-d vector per input, in order.
 */
export async function embedTexts(texts: string[], opts: Options = {}): Promise<number[][]> {
  const out: number[][] = [];
  for (const batch of packByTokens(texts, MAX_REQUEST_TOKENS)) {
    out.push(...(await embedBatch(batch, opts)));
  }
  return out;
}

async function embedBatch(texts: string[], opts: Options): Promise<number[][]> {
  try {
    return await requestWithRetry(texts, opts);
  } catch (err) {
    // Token estimate was too optimistic: halve and try again.
    if (err instanceof MistralError && err.status === 400 && texts.length > 1) {
      const mid = Math.ceil(texts.length / 2);
      return [...(await embedBatch(texts.slice(0, mid), opts)), ...(await embedBatch(texts.slice(mid), opts))];
    }
    throw err;
  }
}

async function requestWithRetry(texts: string[], opts: Options): Promise<number[][]> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await request(texts, opts);
    } catch (err) {
      if (!(err instanceof MistralError) || !err.retryable || attempt >= MAX_RETRIES) throw err;
      const wait = Math.min(1000 * 2 ** attempt, 8000);
      if (opts.deadline !== undefined && now() + wait + REQUEST_TIMEOUT_MS > opts.deadline) throw err;
      await sleep(wait);
    }
  }
}

async function request(texts: string[], opts: Options): Promise<number[][]> {
  const apiKey = opts.apiKey ?? process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new MistralError("MISTRAL_API_KEY is not configured", null, false);

  let res: Response;
  try {
    res = await (opts.fetch ?? fetch)(EMBEDDINGS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: opts.model ?? EMBED_MODEL, input: texts }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new MistralError(`Mistral request failed: ${(err as Error).message}`, null, true);
  }

  if (!res.ok) {
    // The body is Mistral's error message, never our input or key.
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    const retryable = res.status === 429 || res.status >= 500;
    throw new MistralError(`Mistral embeddings HTTP ${res.status}: ${detail}`, res.status, retryable);
  }

  const body = (await res.json()) as { data?: { index: number; embedding: number[] }[] };
  const data = [...(body.data ?? [])].sort((a, b) => a.index - b.index);
  if (data.length !== texts.length) {
    throw new MistralError(`Mistral returned ${data.length} embeddings for ${texts.length} inputs`, null, false);
  }
  for (const d of data) {
    if (d.embedding?.length !== EMBED_DIMENSIONS) {
      throw new MistralError(`Expected ${EMBED_DIMENSIONS}-d embeddings, got ${d.embedding?.length}`, null, false);
    }
  }
  return data.map((d) => d.embedding);
}

function packByTokens(texts: string[], maxTokens: number): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let tokens = 0;
  for (const text of texts) {
    const t = estimateTokens(text);
    if (batch.length && tokens + t > maxTokens) {
      batches.push(batch);
      batch = [];
      tokens = 0;
    }
    batch.push(text);
    tokens += t;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
