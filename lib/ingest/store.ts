import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables } from "@/lib/database.types";
import type { ChunkRow } from "./chunk";
import { BOOKS_BUCKET } from "@/lib/storage-paths";

export type BookRow = Tables<"books">;
export type BookPatch = Partial<
  Pick<
    BookRow,
    | "status"
    | "title"
    | "author"
    | "language"
    | "toc"
    | "cover_path"
    | "chunk_count"
    | "embedded_count"
    | "ingest_attempts"
    | "ingest_heartbeat_at"
    | "ingest_error"
  >
>;
export type ChunkInsert = ChunkRow & { book_id: string; user_id: string };
export type PendingChunk = { id: number; content: string; chapter_title: string | null };

/** Everything the ingest worker needs from Postgres and Storage. */
export interface IngestStore {
  getBook(bookId: string): Promise<BookRow | null>;
  /**
   * uploaded|failed (and ready, with `reindex`) -> parsing with counters
   * reset. False if the book was in another state.
   */
  requeue(bookId: string, opts?: { reindex?: boolean }): Promise<boolean>;
  /** Atomic lease via claim_ingest(); null if not claimable. */
  claim(bookId: string, leaseSeconds: number): Promise<BookRow | null>;
  updateBook(bookId: string, patch: BookPatch): Promise<void>;
  epubExists(path: string): Promise<boolean>;
  downloadEpub(path: string): Promise<Uint8Array | null>;
  uploadCover(path: string, data: Uint8Array, contentType: string): Promise<void>;
  deleteChunks(bookId: string): Promise<void>;
  insertChunks(rows: ChunkInsert[]): Promise<void>;
  /** Chunks still missing an embedding, in reading order. */
  pendingChunks(bookId: string, limit: number): Promise<PendingChunk[]>;
  /** One set_chunk_embeddings() call; returns the book's embedded_count. */
  setEmbeddings(bookId: string, rows: { id: number; embedding: number[] }[]): Promise<number>;
}

// Service-role implementation. Callers must have authorized the request.
export function createSupabaseIngestStore(db: SupabaseClient<Database>): IngestStore {
  const storage = () => db.storage.from(BOOKS_BUCKET);
  const check = <T>(res: { data: T; error: { message: string } | null }, what: string): T => {
    if (res.error) throw new Error(`${what}: ${res.error.message}`);
    return res.data;
  };

  return {
    async getBook(bookId) {
      return check(await db.from("books").select("*").eq("id", bookId).maybeSingle(), "load book");
    },

    async requeue(bookId, opts) {
      const rows = check(
        await db
          .from("books")
          .update({
            status: "parsing",
            chunk_count: 0,
            embedded_count: 0,
            ingest_attempts: 0,
            ingest_error: null,
            ingest_heartbeat_at: null,
          })
          .eq("id", bookId)
          .in("status", opts?.reindex ? ["uploaded", "failed", "ready"] : ["uploaded", "failed"])
          .select("id"),
        "requeue book",
      );
      return (rows ?? []).length === 1;
    },

    async claim(bookId, leaseSeconds) {
      const rows = check(
        await db.rpc("claim_ingest", { p_book_id: bookId, p_lease_seconds: leaseSeconds }),
        "claim ingest",
      );
      return rows?.[0] ?? null;
    },

    async updateBook(bookId, patch) {
      check(await db.from("books").update(patch).eq("id", bookId), "update book");
    },

    async epubExists(path) {
      const slash = path.lastIndexOf("/");
      const { data, error } = await storage().list(path.slice(0, slash), { search: path.slice(slash + 1) });
      if (error) throw new Error(`check upload: ${error.message}`);
      return data.some((f) => f.name === path.slice(slash + 1));
    },

    async downloadEpub(path) {
      const { data, error } = await storage().download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },

    async uploadCover(path, data, contentType) {
      const { error } = await storage().upload(path, data, { contentType, upsert: true });
      if (error) throw new Error(`upload cover: ${error.message}`);
    },

    async deleteChunks(bookId) {
      check(await db.from("chunks").delete().eq("book_id", bookId), "delete chunks");
    },

    async insertChunks(rows) {
      check(await db.from("chunks").insert(rows), "insert chunks");
    },

    async pendingChunks(bookId, limit) {
      const rows = check(
        await db
          .from("chunks")
          .select("id, content, chapter_title")
          .eq("book_id", bookId)
          .is("embedding", null)
          .order("chunk_index")
          .limit(limit),
        "load pending chunks",
      );
      return rows ?? [];
    },

    async setEmbeddings(bookId, rows) {
      const count = check(
        await db.rpc("set_chunk_embeddings", { p_book_id: bookId, p_rows: rows as unknown as Json }),
        "set embeddings",
      );
      return count ?? 0;
    },
  };
}
