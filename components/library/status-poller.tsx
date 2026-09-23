"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-renders the library every few seconds while any book is ingesting.
export function StatusPoller({ active, intervalMs = 3000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);
  return null;
}
