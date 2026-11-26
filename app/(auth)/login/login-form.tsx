"use client";

import { useState } from "react";
import { sendLink } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; email: string } | { kind: "error"; message: string };

export function LoginForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const [state, setState] = useState<State>(
    linkError ? { kind: "error", message: "That sign-in link is invalid or has expired. Request a new one." } : { kind: "idle" },
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!email) return;
    setState({ kind: "sending" });

    const result = await sendLink(email, next);
    if (!result.ok) {
      setState({ kind: "error", message: result.message });
      return;
    }
    setState({ kind: "sent", email });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>We&apos;ll email you a sign-in link.</CardDescription>
      </CardHeader>
      <CardContent>
        {state.kind === "sent" ? (
          <p className="text-sm">
            Check <span className="font-medium">{state.email}</span> for your sign-in link.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            {state.kind === "error" && <p className="text-sm text-destructive">{state.message}</p>}
            <Button type="submit" disabled={state.kind === "sending"}>
              {state.kind === "sending" ? "Sending…" : "Send link"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
