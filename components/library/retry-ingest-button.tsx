"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function RetryIngestButton({ bookId }: { bookId: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function retry() {
    setBusy(true);
    const res = await fetch(`/api/books/${bookId}/ingest`, { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) toast.error("Could not restart indexing.");
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" className="h-7 w-fit text-xs" onClick={retry} disabled={busy}>
      {busy ? "Retrying…" : "Retry"}
    </Button>
  );
}
