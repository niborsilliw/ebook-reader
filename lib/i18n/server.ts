import "server-only";
import { cookies, headers } from "next/headers";
import { LANG_COOKIE, isLang, strings, type Lang } from "./strings";

/**
 * The language their browser or phone asks for: the first in Accept-Language
 * that Nancy speaks, else English.
 */
export function langFrom(acceptLanguage: string | null): Lang {
  for (const part of (acceptLanguage ?? "").split(",")) {
    const code = part.split(";")[0].trim().slice(0, 2).toLowerCase();
    if (isLang(code)) return code;
  }
  return "en";
}

export async function getLang(): Promise<Lang> {
  const chosen = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(chosen) ? chosen : langFrom((await headers()).get("accept-language"));
}

/** This request's words, for server components and routes. */
export async function getStrings() {
  return strings(await getLang());
}
