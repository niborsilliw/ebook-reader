"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { publicEnv } from "@/lib/env";
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

      // Straight to storage with the one-time URL, as the Supabase client sends it.
      const form = new FormData();
      form.append("cacheControl", "3600");
      form.append("", file);
      const put = await fetch(body.uploadUrl, {
        method: "PUT",
        headers: { apikey: publicEnv.supabaseAnonKey, "x-upsert": "false" },
        body: form,
      });
      if (!put.ok) throw new Error((await put.json().catch(() => null))?.message ?? "Upload failed");

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
