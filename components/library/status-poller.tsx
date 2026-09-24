"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { STALE_AFTER_MS, startIngest } from "@/lib/books";

/**
 * While any book is ingesting: re-renders the library every few seconds,
 * and re-kicks books whose job has gone stale (a lost hand-off between
 * worker steps, a crashed step, or an upload whose ingest never started).
 */
export function StatusPoller({
  active,
  staleIds,
  intervalMs = 3000,
}: {
  active: boolean;
  staleIds: string[];
  intervalMs?: number;
}) {
  const router = useRouter();
  const kickedAt = useRef(new Map<string, number>());

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);

  useEffect(() => {
    const now = Date.now();
    for (const bookId of staleIds) {
      // At most one kick per book per staleness window.
      if (now - (kickedAt.current.get(bookId) ?? 0) < STALE_AFTER_MS) continue;
      kickedAt.current.set(bookId, now);
      void startIngest(bookId);
    }
  }, [staleIds]);

  return null;
}
