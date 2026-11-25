import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { INVITE_COOKIE, recordReferral } from "@/lib/invites";

// Magic-link landing: exchange the PKCE code for a session cookie.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // The invite rides in the link itself (the email may open in another
      // browser), with the cookie as a fallback.
      const invite = searchParams.get("invite") ?? request.cookies.get(INVITE_COOKIE)?.value;
      if (invite && data.user) {
        try {
          await recordReferral(data.user.id, data.user.created_at, invite);
        } catch (e) {
          console.error("recordReferral failed", e);
        }
      }
      const response = NextResponse.redirect(`${origin}${next}`);
      if (invite) response.cookies.delete(INVITE_COOKIE);
      return response;
    }
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
