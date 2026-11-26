"use server";

// Everything the reader reads or writes after the page has loaded. These run
// on the server as the signed-in reader (row-level security applies), so the
// browser ships no database client at all.
//
// Each returns { data, error } like the Supabase client did, so callers
// handle failure the same way they always have.

import { createClient } from "@/lib/supabase/server";
import { BOOKS_BUCKET, locationsPath } from "@/lib/storage-paths";
import { BOOKMARK_COLUMNS, HIGHLIGHT_COLUMNS, type Bookmark, type Highlight } from "@/lib/notes/types";
import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
type Failure = { message: string; code?: string };
export type Result<T> = { data: T; error: null } | { data: null; error: Failure };

const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = (e: { message: string; code?: string } | null): Result<never> => ({
  data: null,
  error: { message: e?.message ?? "Something went wrong", code: e?.code },
});

// --- reading position ------------------------------------------------------

export type Position = { cfi: string; percentage: number | null; spine_href: string };

export async function savePosition(bookId: string, pos: Position): Promise<Result<{ updated_at: string }>> {
  const { data, error } = await (await createClient())
    .from("reading_positions")
    .upsert({ book_id: bookId, ...pos }, { onConflict: "user_id,book_id" })
    .select("updated_at")
    .single();
  return error ? fail(error) : ok(data);
}

export async function getPosition(bookId: string): Promise<Result<{ cfi: string; updated_at: string } | null>> {
  const { data, error } = await (await createClient())
    .from("reading_positions")
    .select("cfi, updated_at")
    .eq("book_id", bookId)
    .maybeSingle();
  return error ? fail(error) : ok(data);
}

// --- highlights and bookmarks ---------------------------------------------

// id and created_at are passed back only by Undo, to restore the same row.
type NewHighlight = Pick<Tables["highlights"]["Insert"], "book_id" | "cfi_range" | "text" | "chapter_title" | "color"> &
  Partial<Pick<Tables["highlights"]["Insert"], "id" | "note" | "verified" | "created_at">>;

export async function addHighlight(row: NewHighlight): Promise<Result<Highlight>> {
  const { data, error } = await (await createClient()).from("highlights").insert(row).select(HIGHLIGHT_COLUMNS).single();
  return error ? fail(error) : ok(data);
}

export async function updateHighlight(id: string, patch: { note?: string | null; verified?: boolean }): Promise<Result<null>> {
  const { error } = await (await createClient()).from("highlights").update(patch).eq("id", id);
  return error ? fail(error) : ok(null);
}

export async function deleteHighlight(id: string): Promise<Result<null>> {
  const { error } = await (await createClient()).from("highlights").delete().eq("id", id);
  return error ? fail(error) : ok(null);
}

type NewBookmark = Pick<Tables["bookmarks"]["Insert"], "book_id" | "cfi" | "label"> &
  Partial<Pick<Tables["bookmarks"]["Insert"], "id" | "created_at">>;

export async function addBookmark(row: NewBookmark): Promise<Result<Bookmark>> {
  const { data, error } = await (await createClient()).from("bookmarks").insert(row).select(BOOKMARK_COLUMNS).single();
  return error ? fail(error) : ok(data);
}

export async function deleteBookmark(id: string): Promise<Result<null>> {
  const { error } = await (await createClient()).from("bookmarks").delete().eq("id", id);
  return error ? fail(error) : ok(null);
}

// --- conversations ---------------------------------------------------------

export async function listConversations(bookId: string) {
  const { data, error } = await (await createClient())
    .from("conversations")
    .select("id, title, updated_at")
    .eq("book_id", bookId)
    .order("updated_at", { ascending: false });
  return error ? fail(error) : ok(data);
}

export async function listMessages(conversationId: string) {
  const { data, error } = await (await createClient())
    .from("messages")
    .select("id, role, content, citations, web_sources")
    .eq("conversation_id", conversationId)
    .order("created_at");
  return error ? fail(error) : ok(data);
}

// --- page-number cache -----------------------------------------------------
// Working out page numbers for a long book is slow, so the result is kept
// next to the EPUB after the first open.

async function locationsFile(bookId: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  return userId ? { storage: supabase.storage.from(BOOKS_BUCKET), path: locationsPath(userId, bookId) } : null;
}

export async function loadLocations(bookId: string): Promise<string | null> {
  const file = await locationsFile(bookId);
  if (!file) return null;
  const { data } = await file.storage.download(file.path);
  return data ? data.text() : null;
}

export async function saveLocations(bookId: string, json: string): Promise<void> {
  const file = await locationsFile(bookId);
  if (!file) return;
  await file.storage.upload(file.path, new Blob([json], { type: "application/json" }), {
    upsert: true,
    contentType: "application/json",
  });
}
