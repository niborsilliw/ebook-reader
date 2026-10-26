import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signOut } from "../actions";

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
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
    </>
  );
}
