import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Readable codes: no 0/O, 1/l/I.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export const INVITE_COOKIE = "nancy_invite";

export function isInviteCode(code: unknown): code is string {
  return typeof code === "string" && /^[a-z0-9]{6,12}$/.test(code);
}

function newCode(length = 7) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** The reader's personal invite code, made on first use. */
export async function getOrCreateInviteCode(userId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("invite_codes").select("code").eq("owner_id", userId).maybeSingle();
  if (existing) return existing.code;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const { error } = await admin.from("invite_codes").insert({ code, owner_id: userId });
    if (!error) return code;
    // Lost a race with ourselves (another tab): read the winner.
    const { data: again } = await admin.from("invite_codes").select("code").eq("owner_id", userId).maybeSingle();
    if (again) return again.code;
  }
  throw new Error("Could not create an invite code");
}

/**
 * Record who brought this reader in. Only for a new account (made in the last
 * day) with no referral yet, and never your own code.
 */
export async function recordReferral(userId: string, userCreatedAt: string | undefined, code: string) {
  if (!isInviteCode(code)) return;
  if (!userCreatedAt || Date.now() - new Date(userCreatedAt).getTime() > 24 * 60 * 60 * 1000) return;

  const admin = createAdminClient();
  const { data: owner } = await admin.from("invite_codes").select("owner_id").eq("code", code).maybeSingle();
  if (!owner || owner.owner_id === userId) return;

  // Primary key on user_id: the first invite wins, later ones are ignored.
  await admin
    .from("referrals")
    .upsert({ user_id: userId, invited_by: owner.owner_id, code }, { onConflict: "user_id", ignoreDuplicates: true });
}
