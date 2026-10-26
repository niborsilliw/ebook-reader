import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb } from "./helpers/db";

describe("migrations, applied in order", () => {
  let pg: PGlite;
  beforeAll(async () => {
    pg = await createTestDb();
  });
  afterAll(async () => {
    await pg.close();
  });

  it("leave no notebooks table (added in 0003, dropped in 0004)", async () => {
    const { rows } = await pg.query<{ t: string | null }>(`select to_regclass('public.notebooks')::text as t`);
    expect(rows[0].t).toBeNull();
  });

  it("keep the reader's tables", async () => {
    const { rows } = await pg.query<{ t: string }>(
      `select tablename as t from pg_tables where schemaname = 'public' order by tablename`,
    );
    expect(rows.map((r) => r.t)).toEqual(["bookmarks", "books", "chunks", "conversations", "highlights", "messages", "reading_positions"]);
  });
});
