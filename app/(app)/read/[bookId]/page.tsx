import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BOOKS_BUCKET } from "@/lib/storage-paths";
import type { TocEntry } from "@/lib/epub/parse";
import { ReaderShell } from "@/components/reader/reader-shell";
import { BOOKMARK_COLUMNS, HIGHLIGHT_COLUMNS } from "@/lib/notes/types";

// Long enough for a reading session; the viewer downloads the file once on open.
const SIGNED_URL_SECONDS = 60 * 60;

export async function generateMetadata({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("books").select("title").eq("id", bookId).maybeSingle();
  return { title: data?.title ?? "Reader" };
}

export default async function ReadPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const supabase = await createClient();

  // RLS: only the owner gets a row back.
  const { data: book } = await supabase
    .from("books")
    .select("id, user_id, title, author, publisher, published, isbn, file_path, toc, status")
    .eq("id", bookId)
    .maybeSingle();
  if (!book) notFound();

  const [{ data: signed }, { data: position, error: positionError }, highlights, bookmarks] = await Promise.all([
    supabase.storage.from(BOOKS_BUCKET).createSignedUrl(book.file_path, SIGNED_URL_SECONDS),
    supabase.from("reading_positions").select("cfi, updated_at").eq("book_id", bookId).maybeSingle(),
    supabase.from("highlights").select(HIGHLIGHT_COLUMNS).eq("book_id", bookId),
    supabase.from("bookmarks").select(BOOKMARK_COLUMNS).eq("book_id", bookId),
  ]);
  if (!signed?.signedUrl) throw new Error("Could not open this book's file");
  // Opening at the start is a safe fallback, but a failed read shouldn't be silent.
  if (positionError) console.error("load reading position failed", bookId, positionError.message);
  // The book still opens without them; the notes panel just starts empty.
  if (highlights.error) console.error("load highlights failed", bookId, highlights.error.message);
  if (bookmarks.error) console.error("load bookmarks failed", bookId, bookmarks.error.message);

  return (
    <ReaderShell
      bookId={book.id}
      userId={book.user_id}
      title={book.title ?? "Untitled"}
      author={book.author}
      publication={{ publisher: book.publisher, published: book.published, isbn: book.isbn }}
      fileUrl={signed.signedUrl}
      initialCfi={position?.cfi ?? null}
      initialPositionAt={position?.updated_at ?? null}
      toc={(book.toc as unknown as TocEntry[] | null) ?? []}
      ready={book.status === "ready"}
      initialHighlights={highlights.data ?? []}
      initialBookmarks={bookmarks.data ?? []}
    />
  );
}
