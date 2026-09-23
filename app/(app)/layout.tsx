import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { signOut } from "./actions";

// Middleware already redirects signed-out users; this is the authoritative
// server-side check for everything under (app).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  if (!(await getUserId(supabase))) redirect("/login");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-12 items-center justify-between border-b px-4">
        <Link href="/library" className="font-semibold">
          Reader
        </Link>
        <form action={signOut}>
          <Button variant="ghost" size="sm" type="submit">
            Sign out
          </Button>
        </form>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
