// Only allow same-origin relative paths as post-login destinations.
export function safeNextPath(next: string | null | undefined, fallback = "/library") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
