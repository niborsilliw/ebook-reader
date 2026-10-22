import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { cfiStart, compareCfi, groupByChapter, UNTITLED_CHAPTER } from "@/lib/notes/order";
import { createTestDb, insertBook, resetDb, USER_ID } from "./helpers/db";

describe("CFI reading order", () => {
  it("takes the start of a range", () => {
    expect(cfiStart("epubcfi(/6/4!/4/2[x],/118/1:0,/118/1:40)")).toBe("/6/4!/4/2[x]/118/1:0");
    expect(cfiStart("epubcfi(/6/4!/4/2/1:0)")).toBe("/6/4!/4/2/1:0");
  });

  it("orders by spine item, then path, then offset, numerically", () => {
    const sorted = [
      "epubcfi(/6/6!/4/2/1:0)",
      "epubcfi(/6/4!/4/2[a]/118/1:40)",
      "epubcfi(/6/4!/4/2[a],/12/1:5,/12/1:9)",
      "epubcfi(/6/4!/4/2[a]/118/1:0)",
      "epubcfi(/6/4!/4/2[a]/20/1:0)",
    ].sort(compareCfi);
    expect(sorted).toEqual([
      "epubcfi(/6/4!/4/2[a],/12/1:5,/12/1:9)",
      "epubcfi(/6/4!/4/2[a]/20/1:0)",
      "epubcfi(/6/4!/4/2[a]/118/1:0)",
      "epubcfi(/6/4!/4/2[a]/118/1:40)",
      "epubcfi(/6/6!/4/2/1:0)",
    ]);
  });

  it("groups highlights by chapter in reading order", () => {
    const h = (cfi_range: string, chapter_title: string | null) => ({ cfi_range, chapter_title });
    const groups = groupByChapter([
      h("epubcfi(/6/6!/4/2,/1:0,/1:4)", "Two"),
      h("epubcfi(/6/4!/4/2,/9:0,/9:4)", "One"),
      h("epubcfi(/6/8!/4/2,/1:0,/1:4)", null),
      h("epubcfi(/6/4!/4/2,/3:0,/3:4)", "One"),
    ]);
    expect(groups.map((g) => [g.chapter, g.items.length])).toEqual([["One", 2], ["Two", 1], [UNTITLED_CHAPTER, 1]]);
    expect(groups[0].items[0].cfi_range).toBe("epubcfi(/6/4!/4/2,/3:0,/3:4)");
  });
});

describe("highlights and bookmarks RLS", () => {
  const BOOK = "33333333-3333-4333-8333-333333333333";
  const OTHER_USER = "00000000-0000-0000-0000-0000000000b2";
  const OTHER_BOOK = "44444444-4444-4444-8444-444444444444";
  let pg: PGlite;

  const as = async (userId: string) => pg.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${userId}';`);

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

  it("lets a user save highlights on their own book, defaulting to yellow", async () => {
    await as(USER_ID);
    const { rows } = await pg.query<{ user_id: string; color: string }>(
      `insert into public.highlights (book_id, cfi_range, text, chapter_title) values ($1, 'epubcfi(/6/4!/4,/1:0,/1:5)', 'hello', 'One') returning user_id, color`,
      [BOOK],
    );
    expect(rows[0]).toEqual({ user_id: USER_ID, color: "yellow" });
  });

  it("rejects highlights and bookmarks on someone else's book", async () => {
    await as(USER_ID);
    await expect(
      pg.query(`insert into public.highlights (book_id, cfi_range, text) values ($1, 'c', 't')`, [OTHER_BOOK]),
    ).rejects.toThrow(/row-level security/);
    await expect(pg.query(`insert into public.bookmarks (book_id, cfi) values ($1, 'c')`, [OTHER_BOOK])).rejects.toThrow(
      /row-level security/,
    );
  });

  it("hides other users' highlights and bookmarks", async () => {
    await as(OTHER_USER);
    await pg.query(`insert into public.highlights (book_id, cfi_range, text) values ($1, 'c', 't')`, [OTHER_BOOK]);
    await pg.query(`insert into public.bookmarks (book_id, cfi) values ($1, 'c')`, [OTHER_BOOK]);
    await as(USER_ID);
    expect((await pg.query(`select * from public.highlights`)).rows).toHaveLength(0);
    expect((await pg.query(`select * from public.bookmarks`)).rows).toHaveLength(0);
    expect((await pg.query(`delete from public.highlights returning id`)).rows).toHaveLength(0);
  });

  it("rejects unknown colours and duplicate bookmarks", async () => {
    await as(USER_ID);
    await expect(
      pg.query(`insert into public.highlights (book_id, cfi_range, text, color) values ($1, 'c', 't', 'purple')`, [BOOK]),
    ).rejects.toThrow(/check constraint/);
    await pg.query(`insert into public.bookmarks (book_id, cfi) values ($1, 'c')`, [BOOK]);
    await expect(pg.query(`insert into public.bookmarks (book_id, cfi) values ($1, 'c')`, [BOOK])).rejects.toThrow(
      /duplicate key/,
    );
  });
});

describe("highlight colours", () => {
  it("match the colours the database allows", async () => {
    const { readFileSync } = await import("node:fs");
    const { HIGHLIGHT_COLORS } = await import("@/lib/notes/colors");
    const sql = readFileSync("supabase/migrations/0002_notes.sql", "utf8");
    const allowed = sql.match(/color in \(([^)]*)\)/)![1].match(/'(\w+)'/g)!.map((s) => s.slice(1, -1));
    expect(HIGHLIGHT_COLORS.map((c) => c.id)).toEqual(allowed);
  });
});
