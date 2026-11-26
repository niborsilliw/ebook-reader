import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { LANG_COOKIE, isLang } from "@/lib/i18n/strings";

export async function middleware(request: NextRequest) {
  // ?lang=es on any page picks the language for this browser, over its own
  // setting, until ?lang=en (for bilingual readers, and for testing).
  const lang = request.nextUrl.searchParams.get("lang");
  if (isLang(lang)) request.cookies.set(LANG_COOKIE, lang);

  const response = await updateSession(request);
  if (isLang(lang)) response.cookies.set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
