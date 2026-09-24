import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export const INGEST_SECRET_HEADER = "x-ingest-secret";

/** Constant-time check of the machine-to-machine ingest secret. */
export function isValidIngestSecret(provided: string | null): boolean {
  const expected = process.env.INGEST_SECRET;
  if (!expected || !provided) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(provided), digest(expected));
}
