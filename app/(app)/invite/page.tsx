import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateInviteCode } from "@/lib/invites";
import { CopyLink } from "./copy-link";

export const metadata = { title: "Invite" };

export default async function InvitePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/invite");

  const code = await getOrCreateInviteCode(user.id);
  const link = `https://nancyreader.com/i/${code}`;

  // Who came in through this link (emails live in auth, so read them server-side).
  const admin = createAdminClient();
  const { data: refs } = await admin
    .from("referrals")
    .select("user_id, created_at")
    .eq("invited_by", user.id)
    .order("created_at", { ascending: true });
  const people = await Promise.all(
    (refs ?? []).map(async (r) => {
      const { data } = await admin.auth.admin.getUserById(r.user_id);
      return { email: data.user?.email ?? "someone", joined: r.created_at };
    }),
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6">
      <Link href="/library" className="text-sm text-muted-foreground">
        ← Library
      </Link>
      <h1 className="text-2xl font-semibold">Invite a reader</h1>
      <p className="text-sm text-muted-foreground">
        Send this link to someone who&apos;d like Nancy. When they sign up through it, they&apos;re yours.
      </p>
      <CopyLink link={link} />
      <section className="grid gap-2">
        <h2 className="text-sm font-medium">
          {people.length === 0 ? "No one yet." : `You've brought in ${people.length}:`}
        </h2>
        <ul className="grid gap-1 text-sm">
          {people.map((p) => (
            <li key={p.email}>{p.email}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
