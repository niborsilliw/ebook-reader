import { NextResponse, type NextRequest } from "next/server";
import { INVITE_COOKIE, isInviteCode } from "@/lib/invites";

// A reader's personal invite link: remember who sent it, then sign in.
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toLowerCase();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (!isInviteCode(code)) return NextResponse.redirect(url);

  url.searchParams.set("invite", code);
  const response = NextResponse.redirect(url);
  response.cookies.set(INVITE_COOKIE, code, {
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
  });
  return response;
}
