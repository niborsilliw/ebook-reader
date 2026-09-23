import { NextResponse } from "next/server";
import { createClient, getUserId } from "@/lib/supabase/server";
import { BOOKS_BUCKET } from "@/lib/storage-paths";

// Deletes a book's files and its row (chunks, conversations, messages and
// reading positions cascade). Runs as the user, so RLS scopes everything.
export async function DELETE(_request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const supabase = await createClient();
  const userId = await getUserId(supabase);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: book } = await supabase.from("books").select("id").eq("id", bookId).maybeSingle();
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const folder = `${userId}/${bookId}`;
  const storage = supabase.storage.from(BOOKS_BUCKET);
  const { data: files, error: listError } = await storage.list(folder);
  if (listError) {
    console.error("storage list failed", listError);
    return NextResponse.json({ error: "Could not delete book files" }, { status: 500 });
  }
  if (files.length) {
    const { error } = await storage.remove(files.map((f) => `${folder}/${f.name}`));
    if (error) {
      console.error("storage remove failed", error);
      return NextResponse.json({ error: "Could not delete book files" }, { status: 500 });
    }
  }

  const { error } = await supabase.from("books").delete().eq("id", bookId);
  if (error) {
    console.error("books delete failed", error);
    return NextResponse.json({ error: "Could not delete book" }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
