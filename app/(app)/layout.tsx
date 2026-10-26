import { redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";

// Middleware already redirects signed-out users; this is the authoritative
// server-side check for everything under (app). The app bar lives in the
// library's layout: the reader gives the whole screen to the page.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  if (!(await getUserId(supabase))) redirect("/login");
  return <div className="flex min-h-dvh flex-col">{children}</div>;
}
