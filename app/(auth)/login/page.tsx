import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; invite?: string }>;
}) {
  const { next, error, invite } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <LoginForm next={next} linkError={error === "link"} invite={invite && /^[a-z0-9]{6,12}$/.test(invite) ? invite : undefined} />
    </main>
  );
}
