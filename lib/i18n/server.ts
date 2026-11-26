import "server-only";
import { headers } from "next/headers";
import { LANGS, strings, type Lang } from "./strings";

/**
 * The reader's language, from their browser or phone setting: the first
 * language in Accept-Language that Nancy speaks, else English.
 */
export function langFrom(acceptLanguage: string | null): Lang {
  for (const part of (acceptLanguage ?? "").split(",")) {
    const code = part.split(";")[0].trim().slice(0, 2).toLowerCase();
    if ((LANGS as readonly string[]).includes(code)) return code as Lang;
  }
  return "en";
}

export async function getLang(): Promise<Lang> {
  return langFrom((await headers()).get("accept-language"));
}

/** This request's words, for server components and routes. */
export async function getStrings() {
  return strings(await getLang());
}
