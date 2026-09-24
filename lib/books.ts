import type { Enums } from "@/lib/database.types";

export type IngestStatus = Enums<"ingest_status">;

// Matches the `books` bucket limit (supabase/config.toml).
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export const isIngesting = (status: IngestStatus) =>
  status === "uploaded" || status === "parsing" || status === "embedding";

export const titleFromFileName = (name: string) =>
  name.replace(/\.epub$/i, "").replace(/[_]+/g, " ").trim() || "Untitled";

// No heartbeat/progress for this long => the job is presumed dead and the
// library page re-kicks it. Must exceed a step's 60 s maximum.
export const STALE_AFTER_MS = 2 * 60 * 1000;

export const startIngest = (bookId: string) =>
  fetch(`/api/books/${bookId}/ingest`, { method: "POST" }).catch(() => undefined);
