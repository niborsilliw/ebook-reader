import { createClient } from "@/lib/supabase/server";
import { BOOKS_BUCKET } from "@/lib/storage-paths";
import { STALE_AFTER_MS, isIngesting } from "@/lib/books";
import { BookCard } from "@/components/library/book-card";
import { UploadButton } from "@/components/library/upload-button";
import { StatusPoller } from "@/components/library/status-poller";

export const metadata = { title: "Library" };

export default async function LibraryPage() {
  const supabase = await createClient();
  const { data: books, error } = await supabase
    .from("books")
    .select("id, title, author, status, chunk_count, embedded_count, cover_path, ingest_error, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const coverPaths = books.flatMap((b) => (b.cover_path ? [b.cover_path] : []));
  const coverUrls = new Map<string, string>();
  if (coverPaths.length) {
    const { data } = await supabase.storage.from(BOOKS_BUCKET).createSignedUrls(coverPaths, 60 * 60);
    for (const item of data ?? []) if (item.path && item.signedUrl) coverUrls.set(item.path, item.signedUrl);
  }

  // Staleness is judged on the server clock, against updated_at, which the
  // worker bumps on every claim, heartbeat and batch.
  const renderedAt = Date.now();
  const staleIds = books
    .filter((b) => isIngesting(b.status) && renderedAt - Date.parse(b.updated_at) > STALE_AFTER_MS)
    .map((b) => b.id);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Library</h1>
        <UploadButton />
      </div>

      {books.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          No books yet. Upload an EPUB to get started.
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {books.map((book) => (
            <li key={book.id}>
              <BookCard book={book} coverUrl={book.cover_path ? coverUrls.get(book.cover_path) : undefined} />
            </li>
          ))}
        </ul>
      )}

      <StatusPoller active={books.some((b) => isIngesting(b.status))} staleIds={staleIds} />
    </main>
  );
}
