import { LoginForm } from "./login-form";
import { getStrings } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: (await getStrings()).signIn };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <LoginForm next={next} linkError={error === "link"} />
    </main>
  );
}
