import type { Enums } from "@/lib/database.types";

export type IngestStatus = Enums<"ingest_status">;

// Matches the `books` bucket limit (supabase/config.toml).
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export const isIngesting = (status: IngestStatus) =>
  status === "uploaded" || status === "parsing" || status === "embedding";

export const titleFromFileName = (name: string) =>
  name.replace(/\.epub$/i, "").replace(/[_]+/g, " ").trim() || "Untitled";
