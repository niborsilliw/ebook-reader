-- Notes & highlights: per-user highlights (with optional notes) and bookmarks.
-- Same ownership model as reading_positions: rows are the user's own, and
-- may only point at the user's own books.

-- ---------------------------------------------------------------------------
-- highlights
-- ---------------------------------------------------------------------------
create table public.highlights (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  book_id       uuid not null references public.books on delete cascade,
  cfi_range     text not null,              -- epub.js range CFI of the highlighted text
  text          text not null,              -- the highlighted text, as selected
  note          text,
  color         text not null default 'yellow' check (color in ('yellow', 'green', 'blue', 'pink')),
  chapter_title text,                       -- for grouping in the notes panel
  created_at    timestamptz not null default now()
);

create index highlights_book_idx on public.highlights (user_id, book_id, created_at);

-- ---------------------------------------------------------------------------
-- bookmarks
-- ---------------------------------------------------------------------------
create table public.bookmarks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  book_id    uuid not null references public.books on delete cascade,
  cfi        text not null,
  label      text,
  created_at timestamptz not null default now(),
  unique (user_id, book_id, cfi)
);

create index bookmarks_book_idx on public.bookmarks (user_id, book_id, created_at);

-- ---------------------------------------------------------------------------
-- Row level security: full control of own rows, only for own books.
-- ---------------------------------------------------------------------------
alter table public.highlights enable row level security;
alter table public.bookmarks  enable row level security;

create policy "highlights_select_own" on public.highlights
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "highlights_insert_own" on public.highlights
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "highlights_update_own" on public.highlights
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "highlights_delete_own" on public.highlights
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "bookmarks_select_own" on public.bookmarks
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "bookmarks_insert_own" on public.bookmarks
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "bookmarks_update_own" on public.bookmarks
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "bookmarks_delete_own" on public.bookmarks
  for delete to authenticated
  using (user_id = (select auth.uid()));
