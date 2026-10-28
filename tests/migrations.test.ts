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

  it("leave no notebooks table (dropped by 0003)", async () => {
    const { rows } = await pg.query<{ t: string | null }>(`select to_regclass('public.notebooks')::text as t`);
    expect(rows[0].t).toBeNull();
  });

  it("add academic mode's columns (0004)", async () => {
    const { rows } = await pg.query<{ c: string }>(
      `select table_name || '.' || column_name || ' ' || data_type as c from information_schema.columns
       where table_schema = 'public' and column_name in ('publisher', 'published', 'isbn', 'verified', 'web_sources')
       order by 1`,
    );
    expect(rows.map((r) => r.c)).toEqual([
      "books.isbn text",
      "books.published text",
      "books.publisher text",
      "highlights.verified boolean",
      "messages.web_sources jsonb",
    ]);
  });

  it("keep the reader's tables", async () => {
    const { rows } = await pg.query<{ t: string }>(
      `select tablename as t from pg_tables where schemaname = 'public' order by tablename`,
    );
    expect(rows.map((r) => r.t)).toEqual(["bookmarks", "books", "chunks", "conversations", "highlights", "messages", "reading_positions"]);
  });
});
