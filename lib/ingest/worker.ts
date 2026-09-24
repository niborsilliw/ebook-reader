import { EpubParseError, parseEpub } from "@/lib/epub/parse";
import { MistralError } from "@/lib/mistral";
import { coverPath } from "@/lib/storage-paths";
import { chunkBook, embeddingInput } from "./chunk";
import type { IngestStore } from "./store";
import type { Json } from "@/lib/database.types";

export const LEASE_SECONDS = 90; // > the 60 s function limit, so a live worker never loses its lease
export const MAX_ATTEMPTS = 5; // claims without a clean finish before giving up
export const EMBED_BATCH = 64; // chunks per set_chunk_embeddings() call
export const INSERT_BATCH = 500; // chunk rows per insert
// Don't start another embed batch with less time than this left.
export const MIN_BATCH_TIME_MS = 12_000;

export type StepOutcome =
  | { kind: "ready" }
  | { kind: "more"; embedded: number; total: number }
  | { kind: "busy" }
  | { kind: "failed"; error: string }
  | { kind: "retry-later"; error: string };

export type WorkerDeps = {
  store: IngestStore;
  /** Embeds a batch of texts, one vector per text, in order. */
  embed: (texts: string[]) => Promise<number[][]>;
  /** Epoch ms after which no new batch is started. */
  deadline: number;
  now?: () => number;
};

/** A failure that retrying won't fix. */
class PermanentError extends Error {}

/**
 * Runs one bounded ingest step for a book: claims the lease, parses and
 * chunks if needed, embeds pending chunks until the deadline, then releases
 * the lease. Safe to call repeatedly and concurrently; never throws.
 */
export async function runIngestStep(bookId: string, deps: WorkerDeps): Promise<StepOutcome> {
  const { store, embed, deadline } = deps;
  const now = deps.now ?? Date.now;
  const heartbeat = () => new Date(now()).toISOString();

  let book;
  try {
    book = await store.claim(bookId, LEASE_SECONDS);
  } catch (err) {
    return { kind: "retry-later", error: message(err) };
  }
  if (!book) return { kind: "busy" };

  if (book.ingest_attempts > MAX_ATTEMPTS) {
    const error = `Gave up after ${MAX_ATTEMPTS} attempts${book.ingest_error ? `: ${book.ingest_error}` : ""}`;
    await store.updateBook(bookId, { status: "failed", ingest_error: error, ingest_heartbeat_at: null }).catch(() => {});
    return { kind: "failed", error };
  }

  try {
    let status = book.status;
    let title = book.title;

    if (status === "parsing") {
      const bytes = await store.downloadEpub(book.file_path);
      if (!bytes) throw new PermanentError("The uploaded EPUB file is missing");
      const parsed = await parseEpub(bytes);
      const rows = chunkBook(parsed);
      if (rows.length === 0) throw new PermanentError("No readable text found in this EPUB");

      let cover: string | null = null;
      if (parsed.cover) {
        cover = coverPath(book.user_id, book.id, parsed.cover.ext);
        try {
          await store.uploadCover(cover, parsed.cover.data, parsed.cover.mediaType);
        } catch {
          cover = null; // a missing cover never fails ingest
        }
      }

      // Idempotent: a rerun (after a crash mid-insert, or a retry) starts from zero.
      await store.deleteChunks(bookId);
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        await store.insertChunks(
          rows.slice(i, i + INSERT_BATCH).map((r) => ({ ...r, book_id: bookId, user_id: book.user_id })),
        );
        await store.updateBook(bookId, { ingest_heartbeat_at: heartbeat() });
      }

      title = parsed.title ?? title;
      await store.updateBook(bookId, {
        status: "embedding",
        title,
        author: parsed.author ?? book.author,
        language: parsed.language,
        toc: parsed.toc as unknown as Json,
        cover_path: cover,
        chunk_count: rows.length,
        embedded_count: 0,
        ingest_heartbeat_at: heartbeat(),
      });
      status = "embedding";
    }

    if (status !== "embedding") {
      // claim_ingest only hands out parsing/embedding books; defensive.
      await store.updateBook(bookId, { ingest_heartbeat_at: null });
      return { kind: "busy" };
    }

    let embedded = book.embedded_count;
    let pending = await store.pendingChunks(bookId, EMBED_BATCH);
    while (pending.length && deadline - now() >= MIN_BATCH_TIME_MS) {
      const vectors = await embed(pending.map((c) => embeddingInput(c, title)));
      if (vectors.length !== pending.length) {
        throw new PermanentError(`Embedding count mismatch: ${vectors.length} for ${pending.length} chunks`);
      }
      // Also refreshes the heartbeat (and updated_at) for staleness detection.
      embedded = await store.setEmbeddings(
        bookId,
        pending.map((c, i) => ({ id: c.id, embedding: vectors[i] })),
      );
      pending = await store.pendingChunks(bookId, EMBED_BATCH);
    }

    if (pending.length === 0) {
      await store.updateBook(bookId, {
        status: "ready",
        ingest_attempts: 0,
        ingest_error: null,
        ingest_heartbeat_at: null,
      });
      return { kind: "ready" };
    }

    // Out of time for this invocation: release the lease for the next step.
    await store.updateBook(bookId, { ingest_attempts: 0, ingest_error: null, ingest_heartbeat_at: null });
    const current = await store.getBook(bookId);
    return { kind: "more", embedded, total: current?.chunk_count ?? embedded };
  } catch (err) {
    const error = message(err);
    const permanent =
      err instanceof PermanentError ||
      err instanceof EpubParseError ||
      (err instanceof MistralError && !err.retryable);
    await store
      .updateBook(bookId, permanent
        ? { status: "failed", ingest_error: error, ingest_heartbeat_at: null }
        : { ingest_error: error, ingest_heartbeat_at: null })
      .catch(() => {});
    return permanent ? { kind: "failed", error } : { kind: "retry-later", error };
  }
}

function message(err: unknown) {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}
