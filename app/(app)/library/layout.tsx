import Link from "next/link";
import { getStrings } from "@/lib/i18n/server";
import { Button } from "@/components/ui/button";
import { signOut } from "../actions";

export default async function LibraryLayout({ children }: { children: React.ReactNode }) {
  const t = await getStrings();
  return (
    <>
      {/* Pinned, so Sign out stays in reach on a phone, where the shelf is a
          long two-column scroll (and coming back from a book restores it). */}
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Link href="/library" className="font-semibold">
          Nancy
        </Link>
        <form action={signOut}>
          <Button variant="outline" type="submit" className="h-9 px-3">
            {t.signOut}
          </Button>
        </form>
      </header>
      <div className="flex-1">{children}</div>
    </>
  );
}
