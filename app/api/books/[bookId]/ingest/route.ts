import { NextResponse, after } from "next/server";
import { createClient, getUserId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseIngestStore } from "@/lib/ingest/store";
import { runIngestStep } from "@/lib/ingest/worker";
import { INGEST_SECRET_HEADER, isValidIngestSecret } from "@/lib/ingest/secret";
import { embedTexts } from "@/lib/mistral";

// Hobby plan ceiling. The step itself stops starting new work at STEP_BUDGET_MS.
export const maxDuration = 60;
const STEP_BUDGET_MS = 45_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Starts or continues ingest for a book. Callers: the owner (after upload,
 * on retry, or re-kicking a stalled job) or the worker itself (chaining,
 * authenticated with INGEST_SECRET). Responds immediately; the step runs
 * after the response within this invocation's time limit.
 */
export async function POST(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  if (!UUID.test(bookId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isMachine = isValidIngestSecret(request.headers.get(INGEST_SECRET_HEADER));
  if (!isMachine) {
    const supabase = await createClient();
    if (!(await getUserId(supabase))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // RLS: only the owner can see the row.
    const { data: owned } = await supabase.from("books").select("id").eq("id", bookId).maybeSingle();
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const store = createSupabaseIngestStore(createAdminClient());
  const book = await store.getBook(bookId);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Owners can rebuild a finished book's index (e.g. after parser fixes).
  const reindex = !isMachine && new URL(request.url).searchParams.get("reindex") === "1";
  if (book.status === "ready" && !reindex) return NextResponse.json({ status: "ready" });
  if (book.status === "failed" && isMachine) return NextResponse.json({ status: "failed" });
  if (book.status === "uploaded" || book.status === "failed" || (book.status === "ready" && reindex)) {
    // The row exists before the upload finishes; don't start on a missing file.
    if (!(await store.epubExists(book.file_path))) {
      return NextResponse.json({ error: "Upload not finished" }, { status: 409 });
    }
    await store.requeue(bookId, { reindex });
  }

  const origin = new URL(request.url).origin;
  after(() => runStepAndChain(bookId, origin));
  return NextResponse.json({ status: "accepted" }, { status: 202 });
}

async function runStepAndChain(bookId: string, origin: string) {
  const deadline = Date.now() + STEP_BUDGET_MS;
  const outcome = await runIngestStep(bookId, {
    store: createSupabaseIngestStore(createAdminClient()),
    embed: (texts) => embedTexts(texts, { deadline }),
    deadline,
  });
  console.info("ingest step", bookId, outcome.kind, "error" in outcome ? outcome.error : "");

  if (outcome.kind !== "more") return;
  // Hand off to a fresh invocation. If this is lost, the library page
  // re-kicks the book once it looks stale.
  try {
    await fetch(`${origin}/api/books/${bookId}/ingest`, {
      method: "POST",
      headers: { [INGEST_SECRET_HEADER]: process.env.INGEST_SECRET ?? "" },
    });
  } catch (err) {
    console.error("ingest chain failed", bookId, (err as Error).message);
  }
}
