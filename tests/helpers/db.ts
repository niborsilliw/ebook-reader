import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import type { BookPatch, BookRow, ChunkInsert, IngestStore, PendingChunk } from "@/lib/ingest/store";

// Postgres (WASM) with the real migration applied on top of minimal stand-ins
// for the Supabase platform: roles, auth.users/auth.uid(), storage schema.
export async function createTestDb() {
  const pg = new PGlite({ extensions: { vector } });
  await pg.exec(`
    create schema extensions;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public, extensions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    create schema auth; grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    create function storage.foldername(name text) returns text[] language sql immutable as
      $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
  `);
  await pg.exec(readFileSync("supabase/migrations/0001_init.sql", "utf8"));
  // The worker runs with the service-role key.
  await pg.exec("set role service_role");
  return pg;
}

export const USER_ID = "00000000-0000-0000-0000-0000000000a1";

export async function resetDb(pg: PGlite) {
  await pg.exec("reset role; truncate public.books cascade; delete from auth.users; set role service_role;");
  await pg.exec(`reset role; insert into auth.users values ('${USER_ID}'); set role service_role;`);
}

/** Inserts a book the way POST /api/books does. */
export async function insertBook(pg: PGlite, bookId: string, title = "upload.epub") {
  await pg.query(
    `insert into public.books (id, user_id, file_path, title) values ($1, $2, $3, $4)`,
    [bookId, USER_ID, `${USER_ID}/${bookId}/book.epub`, title],
  );
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string | null));
function toBook(r: Record<string, unknown> | undefined): BookRow | null {
  if (!r) return null;
  return {
    ...(r as BookRow),
    created_at: iso(r.created_at)!,
    updated_at: iso(r.updated_at)!,
    ingest_heartbeat_at: iso(r.ingest_heartbeat_at),
    file_size: r.file_size == null ? null : Number(r.file_size),
  };
}

/** IngestStore over PGlite + an in-memory bucket, mirroring the Supabase one. */
export function createSqlIngestStore(pg: PGlite, files = new Map<string, Uint8Array>()) {
  const store: IngestStore & { files: Map<string, Uint8Array> } = {
    files,

    async getBook(bookId) {
      return toBook((await pg.query<Record<string, unknown>>(`select * from public.books where id = $1`, [bookId])).rows[0]);
    },

    async requeue(bookId, opts) {
      const statuses = opts?.reindex ? ["uploaded", "failed", "ready"] : ["uploaded", "failed"];
      const res = await pg.query(
        `update public.books set status = 'parsing', chunk_count = 0, embedded_count = 0, ingest_attempts = 0,
           ingest_error = null, ingest_heartbeat_at = null
         where id = $1 and status = any(string_to_array($2, ',')::public.ingest_status[]) returning id`,
        [bookId, statuses.join(",")],
      );
      return res.rows.length === 1;
    },

    async claim(bookId, leaseSeconds) {
      const res = await pg.query<Record<string, unknown>>(`select * from public.claim_ingest($1, $2)`, [bookId, leaseSeconds]);
      return toBook(res.rows[0]);
    },

    async updateBook(bookId, patch: BookPatch) {
      const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
      if (!entries.length) return;
      const sets = entries.map(([k], i) => `${k} = $${i + 2}${k === "toc" ? "::jsonb" : ""}`);
      const values = entries.map(([k, v]) => (k === "toc" ? JSON.stringify(v) : v));
      await pg.query(`update public.books set ${sets.join(", ")} where id = $1`, [bookId, ...values]);
    },

    async epubExists(path) {
      return files.has(path);
    },

    async downloadEpub(path) {
      return files.get(path) ?? null;
    },

    async uploadCover(path, data) {
      files.set(path, data);
    },

    async deleteChunks(bookId) {
      await pg.query(`delete from public.chunks where book_id = $1`, [bookId]);
    },

    async insertChunks(rows: ChunkInsert[]) {
      if (!rows.length) return;
      const cols = ["book_id", "user_id", "chunk_index", "spine_index", "spine_href", "chapter_title", "content", "token_count"] as const;
      const values: unknown[] = [];
      const tuples = rows.map((r, i) => {
        cols.forEach((c) => values.push(r[c]));
        return `(${cols.map((_, j) => `$${i * cols.length + j + 1}`).join(", ")})`;
      });
      await pg.query(`insert into public.chunks (${cols.join(", ")}) values ${tuples.join(", ")}`, values);
    },

    async pendingChunks(bookId, limit): Promise<PendingChunk[]> {
      const res = await pg.query<{ id: unknown; content: string; chapter_title: string | null }>(
        `select id, content, chapter_title from public.chunks
         where book_id = $1 and embedding is null order by chunk_index limit $2`,
        [bookId, limit],
      );
      return res.rows.map((r) => ({ ...r, id: Number(r.id) }));
    },

    async setEmbeddings(bookId, rows) {
      const res = await pg.query<{ n: number }>(`select public.set_chunk_embeddings($1, $2::jsonb) as n`, [
        bookId,
        JSON.stringify(rows),
      ]);
      return res.rows[0].n;
    },
  };
  return store;
}
