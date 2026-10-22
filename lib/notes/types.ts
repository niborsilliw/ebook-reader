import type { Database } from "@/lib/database.types";

export type Highlight = Pick<
  Database["public"]["Tables"]["highlights"]["Row"],
  "id" | "cfi_range" | "text" | "note" | "color" | "chapter_title" | "created_at"
>;
export type Bookmark = Pick<Database["public"]["Tables"]["bookmarks"]["Row"], "id" | "cfi" | "label" | "created_at">;

export const HIGHLIGHT_COLUMNS = "id, cfi_range, text, note, color, chapter_title, created_at";
export const BOOKMARK_COLUMNS = "id, cfi, label, created_at";
