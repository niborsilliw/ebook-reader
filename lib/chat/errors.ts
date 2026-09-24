import { MistralError } from "@/lib/mistral";

type WithStatus = { statusCode?: number; status?: number | null; lastError?: unknown; cause?: unknown };

/** HTTP status from a Mistral/AI SDK error, looking through retry and cause wrappers. */
export function upstreamStatus(err: unknown, depth = 0): number | null {
  if (!err || typeof err !== "object" || depth > 4) return null;
  if (err instanceof MistralError) return err.status;
  const e = err as WithStatus;
  if (typeof e.statusCode === "number") return e.statusCode;
  return upstreamStatus(e.lastError, depth + 1) ?? upstreamStatus(e.cause, depth + 1);
}

/** A message safe to show the reader. Never includes upstream response bodies. */
export function chatErrorMessage(err: unknown): string {
  switch (upstreamStatus(err)) {
    case 429:
      return "The AI service is rate-limited right now (Mistral quota). Try again in a minute.";
    case 401:
    case 403:
      return "The AI service rejected this app’s credentials. Check the Mistral API key and plan.";
    default:
      return "The assistant couldn't finish that answer. Try again.";
  }
}
