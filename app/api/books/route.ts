import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getUserId } from "@/lib/supabase/server";
import { BOOKS_BUCKET, epubPath } from "@/lib/storage-paths";
import { MAX_UPLOAD_BYTES, titleFromFileName } from "@/lib/books";

const Body = z.object({
  fileName: z.string().min(1).max(500).regex(/\.epub$/i, "Only .epub files are supported"),
  fileSize: z.number().int().positive().max(MAX_UPLOAD_BYTES, "File is larger than 50 MB"),
});

// Creates the book row and a one-time signed upload URL. The browser uploads
// straight to Storage, so the file never passes through a Vercel function.
export async function POST(request: Request) {
  const supabase = await createClient();
  const userId = await getUserId(supabase);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { fileName, fileSize } = parsed.data;

  const bookId = crypto.randomUUID();
  const path = epubPath(userId, bookId);

  const { error: insertError } = await supabase.from("books").insert({
    id: bookId,
    file_path: path,
    file_size: fileSize,
    title: titleFromFileName(fileName), // replaced by EPUB metadata during ingest
  });
  if (insertError) {
    console.error("books insert failed", insertError);
    return NextResponse.json({ error: "Could not create book" }, { status: 500 });
  }

  const { data, error } = await supabase.storage.from(BOOKS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("signed upload url failed", error);
    await supabase.from("books").delete().eq("id", bookId);
    return NextResponse.json({ error: "Could not prepare upload" }, { status: 500 });
  }

  return NextResponse.json({ bookId, uploadUrl: data.signedUrl });
}
