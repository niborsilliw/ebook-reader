import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, insertBook, resetDb, USER_ID } from "./helpers/db";

describe("notebooks RLS", () => {
  const BOOK = "55555555-5555-4555-8555-555555555555";
  const OTHER_USER = "00000000-0000-0000-0000-0000000000c3";
  const OTHER_BOOK = "66666666-6666-4666-8666-666666666666";
  let pg: PGlite;

  const as = async (userId: string) => pg.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${userId}';`);
  // What the app does: upsert the one row for this user and book.
  const save = (bookId: string, body: string) =>
    pg.query<{ body: string; updated_at: string }>(
      `insert into public.notebooks (book_id, body) values ($1, $2)
       on conflict (user_id, book_id) do update set body = excluded.body
       returning body, updated_at`,
      [bookId, body],
    );

  beforeAll(async () => {
    pg = await createTestDb();
  });
  afterAll(async () => {
    await pg.close();
  });
  beforeEach(async () => {
    await resetDb(pg);
    await pg.exec(`reset role; insert into auth.users values ('${OTHER_USER}');`);
    await insertBook(pg, BOOK);
    await pg.query(`insert into public.books (id, user_id, file_path) values ($1, $2, $3)`, [
      OTHER_BOOK,
      OTHER_USER,
      `${OTHER_USER}/${OTHER_BOOK}/book.epub`,
    ]);
  });

  it("keeps one notebook per user and book, updated in place", async () => {
    await as(USER_ID);
    const first = await save(BOOK, "Does Hannah Arendt relate to this?");
    await new Promise((r) => setTimeout(r, 5));
    const second = await save(BOOK, "Does Hannah Arendt relate to this? The banality of evil.");
    const { rows } = await pg.query<{ body: string; user_id: string }>(`select body, user_id from public.notebooks`);
    expect(rows).toEqual([{ body: "Does Hannah Arendt relate to this? The banality of evil.", user_id: USER_ID }]);
    expect(new Date(second.rows[0].updated_at) > new Date(first.rows[0].updated_at)).toBe(true);
  });

  it("rejects a notebook on someone else's book", async () => {
    await as(USER_ID);
    await expect(save(OTHER_BOOK, "x")).rejects.toThrow(/row-level security/);
  });

  it("hides other users' notebooks", async () => {
    await as(OTHER_USER);
    await save(OTHER_BOOK, "private thoughts");
    await as(USER_ID);
    expect((await pg.query(`select * from public.notebooks`)).rows).toHaveLength(0);
    expect((await pg.query(`update public.notebooks set body = 'x' returning body`)).rows).toHaveLength(0);
  });

  it("caps a notebook at 100,000 characters", async () => {
    await as(USER_ID);
    await expect(save(BOOK, "a".repeat(100_001))).rejects.toThrow(/check constraint/);
  });
});
