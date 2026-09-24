import { describe, expect, it, vi } from "vitest";
import { embedTexts, EMBED_DIMENSIONS, MistralError } from "@/lib/mistral";

type Req = { input: string[]; model: string; auth: string | null };

function mockFetch(handler: (req: Req, n: number) => Response | Promise<Response>) {
  const requests: Req[] = [];
  const fn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const req = { input: body.input, model: body.model, auth: new Headers(init?.headers).get("authorization") };
    requests.push(req);
    return handler(req, requests.length);
  });
  return { fetch: fn as unknown as typeof fetch, requests };
}

const ok = (input: string[], reverse = false) => {
  const data = input.map((t, index) => ({ index, embedding: new Array(EMBED_DIMENSIONS).fill(t.length) }));
  return Response.json({ data: reverse ? data.reverse() : data });
};
const opts = { apiKey: "test-key", sleep: async () => {} };

describe("embedTexts (mocked Mistral API)", () => {
  it("sends mistral-embed requests with the bearer key and returns vectors in input order", async () => {
    const m = mockFetch((req) => ok(req.input, true)); // API returns data out of order
    const out = await embedTexts(["a", "bb", "ccc"], { ...opts, fetch: m.fetch });
    expect(m.requests).toHaveLength(1);
    expect(m.requests[0]).toMatchObject({ model: "mistral-embed", auth: "Bearer test-key" });
    expect(out.map((v) => v[0])).toEqual([1, 2, 3]);
  });

  it("splits inputs into requests under the per-request token cap", async () => {
    const m = mockFetch((req) => ok(req.input));
    const texts = Array.from({ length: 64 }, (_, i) => `${i} ` + "x".repeat(2000)); // ~500 tokens each
    const out = await embedTexts(texts, { ...opts, fetch: m.fetch });
    expect(out).toHaveLength(64);
    expect(m.requests.length).toBeGreaterThan(1);
    for (const r of m.requests) expect(r.input.join("").length / 4).toBeLessThanOrEqual(8_000);
    expect(m.requests.flatMap((r) => r.input)).toEqual(texts);
  });

  it("retries rate limits and server errors, then succeeds", async () => {
    const m = mockFetch((req, n) => (n < 3 ? new Response("slow down", { status: n === 1 ? 429 : 502 }) : ok(req.input)));
    expect(await embedTexts(["a"], { ...opts, fetch: m.fetch })).toHaveLength(1);
    expect(m.requests).toHaveLength(3);
  });

  it("gives up with a retryable error when retries would pass the deadline", async () => {
    const m = mockFetch(() => new Response("busy", { status: 429 }));
    const err = await embedTexts(["a"], { ...opts, fetch: m.fetch, now: () => 0, deadline: 5_000 }).catch((e) => e);
    expect(err).toBeInstanceOf(MistralError);
    expect(err).toMatchObject({ status: 429, retryable: true });
    expect(m.requests).toHaveLength(1);
  });

  it("does not retry auth errors", async () => {
    const m = mockFetch(() => new Response('{"message":"Unauthorized"}', { status: 401 }));
    const err = await embedTexts(["a", "b"], { ...opts, fetch: m.fetch }).catch((e) => e);
    expect(err).toMatchObject({ status: 401, retryable: false });
    expect(m.requests).toHaveLength(1);
  });

  it("halves a batch the API rejects as too large", async () => {
    const m = mockFetch((req) => (req.input.length > 1 ? new Response("too many tokens", { status: 400 }) : ok(req.input)));
    const out = await embedTexts(["a", "b", "c"], { ...opts, fetch: m.fetch });
    expect(out).toHaveLength(3);
    expect(m.requests.filter((r) => r.input.length === 1)).toHaveLength(3);
  });

  it("rejects embeddings with the wrong dimension", async () => {
    const m = mockFetch(() => Response.json({ data: [{ index: 0, embedding: [1, 2, 3] }] }));
    await expect(embedTexts(["a"], { ...opts, fetch: m.fetch })).rejects.toMatchObject({ retryable: false });
  });

  it("reports a missing API key without calling the API", async () => {
    const m = mockFetch((req) => ok(req.input));
    const saved = process.env.MISTRAL_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    try {
      await expect(embedTexts(["a"], { fetch: m.fetch })).rejects.toMatchObject({ retryable: false });
    } finally {
      if (saved !== undefined) process.env.MISTRAL_API_KEY = saved;
    }
    expect(m.requests).toHaveLength(0);
  });
});
