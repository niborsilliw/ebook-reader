import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { parseEpub } from "@/lib/epub/parse";
import { chunkBook } from "@/lib/ingest/chunk";
import { EMBED_BATCH, MAX_ATTEMPTS, runIngestStep, type StepOutcome } from "@/lib/ingest/worker";
import type { IngestStore } from "@/lib/ingest/store";
import { EMBED_DIMENSIONS, MistralError } from "@/lib/mistral";
import { createSqlIngestStore, createTestDb, insertBook, resetDb, USER_ID } from "./helpers/db";
import { epub3, largeEpub } from "./fixtures";

const BOOK = "11111111-1111-4111-8111-111111111111";
const EPUB_PATH = `${USER_ID}/${BOOK}/book.epub`;

let pg: PGlite;
beforeAll(async () => {
  pg = await createTestDb();
}, 30_000);
afterAll(async () => {
  await pg?.close();
});
beforeEach(async () => {
  await resetDb(pg);
});

/** Mocked Mistral: deterministic 1024-d vectors; records every call. */
function mockEmbedder(opts: { failOnCall?: number; error?: Error; onCall?: () => void } = {}) {
  const calls: string[][] = [];
  const embed = async (texts: string[]) => {
    opts.onCall?.();
    if (opts.failOnCall !== undefined && calls.length + 1 === opts.failOnCall) {
      calls.push([]); // count the failed call, embed nothing
      throw opts.error ?? new MistralError("Mistral embeddings HTTP 503: unavailable", 503, true);
    }
    calls.push(texts);
    return texts.map((t) => {
      const v = new Array(EMBED_DIMENSIONS).fill(0);
      v[[...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % EMBED_DIMENSIONS] = 1;
      return v;
    });
  };
  return { embed, calls, embeddedTexts: () => calls.flat() };
}

/** Wraps a store to record every status the book moves through. */
function recordStatuses(store: IngestStore, initial: string) {
  const statuses = [initial];
  const push = (s?: string) => s && s !== statuses.at(-1) && statuses.push(s);
  return {
    statuses,
    store: {
      ...store,
      async requeue(id: string) {
        const ok = await store.requeue(id);
        if (ok) push("parsing");
        return ok;
      },
      async updateBook(id, patch) {
        await store.updateBook(id, patch);
        push(patch.status);
      },
    } satisfies IngestStore,
  };
}

async function setupBook(bytes: Uint8Array) {
  await insertBook(pg, BOOK);
  const store = createSqlIngestStore(pg);
  store.files.set(EPUB_PATH, bytes);
  return store;
}

async function runToCompletion(store: IngestStore, embed: (t: string[]) => Promise<number[][]>, maxSteps = 20) {
  const outcomes: StepOutcome["kind"][] = [];
  for (let i = 0; i < maxSteps; i++) {
    const outcome = await runIngestStep(BOOK, { store, embed, deadline: Date.now() + 45_000 });
    outcomes.push(outcome.kind);
    if (outcome.kind !== "more") return outcomes;
  }
  throw new Error("did not finish");
}

async function chunkStats() {
  const r = await pg.query<{ n: number; distinct_idx: number; max_idx: number | null; embedded: number }>(
    `select count(*)::int n, count(distinct chunk_index)::int distinct_idx, max(chunk_index) max_idx,
            count(embedding)::int embedded
     from public.chunks where book_id = $1`,
    [BOOK],
  );
  return r.rows[0];
}

describe("ingest worker", () => {
  it("ingests a small EPUB: correct chunk count, metadata, and queued → reading → indexing → ready", async () => {
    const bytes = await epub3();
    const expected = chunkBook(await parseEpub(bytes)).length;
    const base = await setupBook(bytes);
    const { store, statuses } = recordStatuses(base, "uploaded");
    const mistral = mockEmbedder();

    expect(await store.requeue(BOOK)).toBe(true); // what the route does for a fresh upload
    expect(await runToCompletion(store, mistral.embed)).toEqual(["ready"]);

    expect(statuses).toEqual(["uploaded", "parsing", "embedding", "ready"]);
    const stats = await chunkStats();
    expect(stats.n).toBe(expected);
    expect(stats.embedded).toBe(expected);
    expect(mistral.embeddedTexts()).toHaveLength(expected); // each chunk embedded exactly once

    const book = (await store.getBook(BOOK))!;
    expect(book).toMatchObject({
      status: "ready",
      title: "1984",
      author: "George Orwell",
      publisher: "Secker & Warburg",
      published: "1949-06-08",
      isbn: "9780452284234",
      chunk_count: expected,
      embedded_count: expected,
      ingest_attempts: 0,
      ingest_error: null,
      ingest_heartbeat_at: null,
      cover_path: `${USER_ID}/${BOOK}/cover.jpg`,
    });
    expect(book.toc).toHaveLength(3);
    expect(base.files.get(`${USER_ID}/${BOOK}/cover.jpg`)).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    // Embedding text carries the book/chapter header.
    expect(mistral.embeddedTexts().some((t) => t.startsWith("1984 — Part One\n\n"))).toBe(true);
  });

  it(`writes embeddings in batches of ${EMBED_BATCH}, not row by row`, async () => {
    const bytes = await largeEpub(4, 12_000);
    const expected = chunkBook(await parseEpub(bytes)).length;
    expect(expected).toBeGreaterThan(EMBED_BATCH);
    const store = await setupBook(bytes);
    const sizes: number[] = [];
    const counting: IngestStore = {
      ...store,
      setEmbeddings: async (id, rows) => {
        sizes.push(rows.length);
        return store.setEmbeddings(id, rows);
      },
    };
    await store.requeue(BOOK);
    await runToCompletion(counting, mockEmbedder().embed);

    expect(sizes.reduce((a, b) => a + b, 0)).toBe(expected);
    expect(sizes.slice(0, -1).every((s) => s === EMBED_BATCH)).toBe(true);
    expect(sizes.at(-1)).toBeLessThanOrEqual(EMBED_BATCH); // remainder
    expect(sizes.length).toBe(Math.ceil(expected / EMBED_BATCH));
  });

  describe("idempotency", () => {
    it("re-running the parse step replaces chunks instead of duplicating them", async () => {
      const bytes = await epub3();
      const store = await setupBook(bytes);
      await store.requeue(BOOK);
      await runToCompletion(store, mockEmbedder().embed);
      const first = await chunkStats();

      // Force a second full run (e.g. a retry after a failure).
      await store.updateBook(BOOK, { status: "failed" });
      await store.requeue(BOOK);
      await runToCompletion(store, mockEmbedder().embed);

      const second = await chunkStats();
      expect(second).toEqual(first);
      expect(second.distinct_idx).toBe(second.n);
      expect(second.max_idx).toBe(second.n - 1);
    });

    it("recovers from a crash mid-insert without leftover or duplicate chunks", async () => {
      const bytes = await epub3();
      const expected = chunkBook(await parseEpub(bytes)).length;
      const store = await setupBook(bytes);
      await store.requeue(BOOK);
      // Partial rows from a step that died after inserting some chunks.
      await store.insertChunks(
        [0, 1].map((i) => ({
          book_id: BOOK, user_id: USER_ID, chunk_index: i, spine_index: 0, spine_href: "stale.xhtml",
          chapter_title: null, content: "stale", token_count: 1,
        })),
      );

      await runToCompletion(store, mockEmbedder().embed);
      const stats = await chunkStats();
      expect(stats.n).toBe(expected);
      expect(stats.distinct_idx).toBe(expected);
      const stale = await pg.query(`select 1 from public.chunks where spine_href = 'stale.xhtml'`);
      expect(stale.rows).toHaveLength(0);
    });

    it("resumes after an embedding failure, embedding only the missing chunks", async () => {
      const bytes = await largeEpub(4, 12_000);
      const expected = chunkBook(await parseEpub(bytes)).length;
      const store = await setupBook(bytes);
      await store.requeue(BOOK);

      const flaky = mockEmbedder({ failOnCall: 2 }); // first batch succeeds, second hits a 503
      const outcome = await runIngestStep(BOOK, { store, embed: flaky.embed, deadline: Date.now() + 45_000 });
      expect(outcome.kind).toBe("retry-later");
      const afterFailure = (await store.getBook(BOOK))!;
      expect(afterFailure).toMatchObject({ status: "embedding", embedded_count: EMBED_BATCH, ingest_heartbeat_at: null });
      expect(afterFailure.ingest_error).toMatch(/503/);
      const idsBefore = (await pg.query(`select id from public.chunks where book_id = $1 order by id`, [BOOK])).rows;

      const healthy = mockEmbedder();
      expect(await runToCompletion(store, healthy.embed)).toEqual(["ready"]);
      expect(healthy.embeddedTexts()).toHaveLength(expected - EMBED_BATCH); // no re-embedding
      const idsAfter = (await pg.query(`select id from public.chunks where book_id = $1 order by id`, [BOOK])).rows;
      expect(idsAfter).toEqual(idsBefore); // not re-parsed
      expect((await chunkStats()).embedded).toBe(expected);
      expect((await store.getBook(BOOK))!.ingest_error).toBeNull();
    });
  });

  it("stops cleanly at the time budget and releases the lease for the next step", async () => {
    const bytes = await largeEpub(4, 12_000);
    const expected = chunkBook(await parseEpub(bytes)).length;
    const store = await setupBook(bytes);
    await store.requeue(BOOK);

    let clock = 1_000_000;
    const slow = mockEmbedder({ onCall: () => (clock += 40_000) }); // each batch "takes" 40 s
    const outcome = await runIngestStep(BOOK, { store, embed: slow.embed, deadline: clock + 45_000, now: () => clock });

    expect(outcome).toEqual({ kind: "more", embedded: EMBED_BATCH, total: expected });
    expect(slow.calls).toHaveLength(1);
    const book = (await store.getBook(BOOK))!;
    expect(book).toMatchObject({ status: "embedding", ingest_heartbeat_at: null, ingest_attempts: 0 });

    // The next invocation can claim immediately and finishes the job.
    expect(await runToCompletion(store, mockEmbedder().embed)).toEqual(["ready"]);
    expect((await chunkStats()).embedded).toBe(expected);
  });

  it("does nothing while another worker holds a fresh lease", async () => {
    const store = await setupBook(await epub3());
    await store.requeue(BOOK);
    expect(await store.claim(BOOK, 90)).not.toBeNull(); // another worker

    const mistral = mockEmbedder();
    expect(await runIngestStep(BOOK, { store, embed: mistral.embed, deadline: Date.now() + 45_000 })).toEqual({ kind: "busy" });
    expect(mistral.calls).toHaveLength(0);
    expect((await chunkStats()).n).toBe(0);
  });

  it("refuses books that were never queued", async () => {
    const store = await setupBook(await epub3()); // status 'uploaded'
    expect((await runIngestStep(BOOK, { store, embed: mockEmbedder().embed, deadline: Date.now() + 45_000 })).kind).toBe("busy");
  });

  describe("failures", () => {
    async function runOnce(store: IngestStore, embed = mockEmbedder().embed) {
      return runIngestStep(BOOK, { store, embed, deadline: Date.now() + 45_000 });
    }

    it("marks an invalid EPUB as failed with a message", async () => {
      const store = await setupBook(new TextEncoder().encode("not an epub"));
      await store.requeue(BOOK);
      expect(await runOnce(store)).toEqual({ kind: "failed", error: "Not a valid EPUB (zip) file" });
      expect(await store.getBook(BOOK)).toMatchObject({ status: "failed", ingest_error: "Not a valid EPUB (zip) file" });
    });

    it("marks a missing file as failed", async () => {
      await insertBook(pg, BOOK);
      const store = createSqlIngestStore(pg);
      await store.updateBook(BOOK, { status: "parsing" });
      expect((await runOnce(store)).kind).toBe("failed");
      expect((await store.getBook(BOOK))!.ingest_error).toMatch(/missing/);
    });

    it("fails permanently on a non-retryable Mistral error (e.g. bad API key)", async () => {
      const store = await setupBook(await epub3());
      await store.requeue(BOOK);
      const bad = mockEmbedder({ failOnCall: 1, error: new MistralError("Mistral embeddings HTTP 401: Unauthorized", 401, false) });
      expect((await runOnce(store, bad.embed)).kind).toBe("failed");
      expect(await store.getBook(BOOK)).toMatchObject({ status: "failed", ingest_error: expect.stringMatching(/401/) });
    });

    it(`gives up after ${MAX_ATTEMPTS} claims without a clean finish`, async () => {
      const store = await setupBook(await epub3());
      await store.requeue(BOOK);
      await store.updateBook(BOOK, { ingest_attempts: MAX_ATTEMPTS, ingest_error: "Mistral embeddings HTTP 503" });
      const mistral = mockEmbedder();
      const outcome = await runOnce(store, mistral.embed);
      expect(outcome).toEqual({ kind: "failed", error: `Gave up after ${MAX_ATTEMPTS} attempts: Mistral embeddings HTTP 503` });
      expect(mistral.calls).toHaveLength(0);
      expect((await store.getBook(BOOK))!.status).toBe("failed");
    });

    it("a ready book is only requeued when reindexing, and rebuilds without duplicates", async () => {
      const store = await setupBook(await epub3());
      await store.requeue(BOOK);
      await runToCompletion(store, mockEmbedder().embed);
      const before = await chunkStats();

      expect(await store.requeue(BOOK)).toBe(false);
      expect(await store.requeue(BOOK, { reindex: true })).toBe(true);
      expect((await store.getBook(BOOK))!).toMatchObject({ status: "parsing", embedded_count: 0 });
      expect(await runToCompletion(store, mockEmbedder().embed)).toEqual(["ready"]);
      expect(await chunkStats()).toEqual(before);
    });

    it("a failed book can be requeued and completes", async () => {
      const store = await setupBook(await epub3());
      await store.updateBook(BOOK, { status: "failed", ingest_error: "earlier failure", ingest_attempts: 6 });
      expect(await store.requeue(BOOK)).toBe(true);
      expect(await runToCompletion(store, mockEmbedder().embed)).toEqual(["ready"]);
    });
  });
});
