import { MistralError } from "@/lib/mistral";
import { strings, type Strings } from "@/lib/i18n/strings";

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
export function chatErrorMessage(err: unknown, t: Strings = strings("en")): string {
  switch (upstreamStatus(err)) {
    case 429:
      return t.rateLimited;
    case 401:
    case 403:
      return t.badCredentials;
    default:
      return t.answerFailed;
  }
}
