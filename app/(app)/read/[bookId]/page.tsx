import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BOOKS_BUCKET } from "@/lib/storage-paths";
import type { TocEntry } from "@/lib/epub/parse";
import { ReaderShell } from "@/components/reader/reader-shell";

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
    .select("id, user_id, title, author, file_path, toc, status")
    .eq("id", bookId)
    .maybeSingle();
  if (!book) notFound();

  const [{ data: signed }, { data: position }] = await Promise.all([
    supabase.storage.from(BOOKS_BUCKET).createSignedUrl(book.file_path, SIGNED_URL_SECONDS),
    supabase.from("reading_positions").select("cfi").eq("book_id", bookId).maybeSingle(),
  ]);
  if (!signed?.signedUrl) throw new Error("Could not open this book's file");

  return (
    <ReaderShell
      bookId={book.id}
      userId={book.user_id}
      title={book.title ?? "Untitled"}
      author={book.author}
      fileUrl={signed.signedUrl}
      initialCfi={position?.cfi ?? null}
      toc={(book.toc as unknown as TocEntry[] | null) ?? []}
      ready={book.status === "ready"}
    />
  );
}
