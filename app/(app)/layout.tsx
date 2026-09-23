import { redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";

// Middleware already redirects signed-out users; this is the authoritative
// server-side check for everything under (app).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  if (!(await getUserId(supabase))) redirect("/login");
  return <>{children}</>;
}
