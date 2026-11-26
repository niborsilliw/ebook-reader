"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

export type SendLinkResult = { ok: true } | { ok: false; message: string };

// Sends the sign-in link from the server, so the login page ships no
// Supabase code to the browser. The PKCE verifier lands in a cookie as before.
export async function sendLink(email: string, next?: string): Promise<SendLinkResult> {
  email = email.trim();
  if (!email) return { ok: false, message: "Enter your email address." };

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", safeNextPath(next));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callback.toString() } });
  if (!error) return { ok: true };

  const inviteOnly = error.status === 403 || /invite-only/i.test(error.message);
  return {
    ok: false,
    message: inviteOnly
      ? "Nancy is invite-only for now. If you've been invited, use the email address your invitation went to."
      : error.message,
  };
}
