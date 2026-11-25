import { describe, expect, it, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb } from "./helpers/db";

// The before-user-created hook lets in only invited emails.
describe("invite-only sign-up hook", () => {
  let pg: PGlite;
  beforeAll(async () => {
    pg = await createTestDb();
    await pg.exec("reset role; insert into public.invites (email, invited_by) values ('reader@example.com', 'Robin');");
  });

  const hook = async (email: string) => {
    const { rows } = await pg.query<{ r: Record<string, unknown> }>(
      "select public.hook_invite_only($1::jsonb) as r",
      [JSON.stringify({ user: { email } })],
    );
    return rows[0].r;
  };

  it("lets an invited email in, whatever its case", async () => {
    expect(await hook("reader@example.com")).toEqual({});
    expect(await hook("Reader@Example.com")).toEqual({});
  });

  it("turns everyone else away", async () => {
    const r = await hook("stranger@example.com");
    expect(r).toMatchObject({ error: { http_code: 403 } });
  });

  it("is not callable by readers", async () => {
    await pg.exec("set role authenticated");
    await expect(hook("reader@example.com")).rejects.toThrow();
    await pg.exec("reset role");
  });
});
