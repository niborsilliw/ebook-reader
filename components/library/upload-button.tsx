"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/browser";
import { BOOKS_BUCKET } from "@/lib/storage-paths";
import { MAX_UPLOAD_BYTES, startIngest } from "@/lib/books";
import { Button } from "@/components/ui/button";

export function UploadButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  async function upload(file: File) {
    if (!/\.epub$/i.test(file.name)) return toast.error("Only .epub files are supported.");
    if (file.size > MAX_UPLOAD_BYTES) return toast.error("That file is larger than 50 MB.");

    setUploading(true);
    let bookId: string | undefined;
    try {
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      bookId = body.bookId;

      const { error } = await createClient()
        .storage.from(BOOKS_BUCKET)
        .uploadToSignedUrl(body.path, body.token, file, { contentType: "application/epub+zip" });
      if (error) throw new Error(error.message);

      toast.success(`Uploaded “${file.name}”`);
      await startIngest(body.bookId);
    } catch (err) {
      // Don't leave a book row with no file behind it.
      if (bookId) await fetch(`/api/books/${bookId}`, { method: "DELETE" }).catch(() => {});
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".epub,application/epub+zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
        {uploading ? "Uploading…" : "Upload EPUB"}
      </Button>
    </>
  );
}
