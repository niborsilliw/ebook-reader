import Link from "next/link";
import type { IngestStatus } from "@/lib/books";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DeleteBookButton } from "./delete-book-button";
import { RetryIngestButton } from "./retry-ingest-button";

type Book = {
  id: string;
  title: string | null;
  author: string | null;
  status: IngestStatus;
  chunk_count: number;
  embedded_count: number;
  ingest_error: string | null;
};

const STATUS_LABEL: Record<IngestStatus, string> = {
  uploaded: "Queued",
  parsing: "Reading",
  embedding: "Indexing",
  ready: "Ready",
  failed: "Failed",
};

export function BookCard({ book, coverUrl }: { book: Book; coverUrl?: string }) {
  const title = book.title ?? "Untitled";
  const progress = book.chunk_count ? Math.round((book.embedded_count / book.chunk_count) * 100) : 0;

  return (
    <div className="group relative flex flex-col gap-2">
      <Link href={`/read/${book.id}`} className="block overflow-hidden rounded-md border bg-muted">
        {coverUrl ? (
          // Signed Storage URLs; next/image would need the bucket host configured.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="aspect-[2/3] w-full object-cover" />
        ) : (
          <div className="flex aspect-[2/3] items-center justify-center p-3 text-center text-sm font-medium [overflow-wrap:anywhere] text-muted-foreground">
            {title}
          </div>
        )}
      </Link>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/read/${book.id}`} className="line-clamp-2 text-sm font-medium [overflow-wrap:anywhere] hover:underline">
            {title}
          </Link>
          {book.author && <p className="truncate text-xs text-muted-foreground">{book.author}</p>}
        </div>
        <DeleteBookButton bookId={book.id} title={title} />
      </div>

      {book.status !== "ready" && (
        <div className="grid gap-1">
          <Badge variant={book.status === "failed" ? "destructive" : "secondary"} className="w-fit">
            {STATUS_LABEL[book.status]}
          </Badge>
          {book.status === "embedding" && <Progress value={progress} aria-label="Indexing progress" />}
          {book.status === "failed" && book.ingest_error && (
            <p className="line-clamp-2 text-xs text-destructive">{book.ingest_error}</p>
          )}
          {book.status === "failed" && <RetryIngestButton bookId={book.id} />}
        </div>
      )}
    </div>
  );
}
