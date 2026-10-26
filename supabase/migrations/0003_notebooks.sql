-- Notebook: one free-form text per user per book, for loose thoughts that
-- belong to the whole book rather than to a highlight. Same ownership model
-- as reading_positions: rows are the user's own, and may only point at the
-- user's own books.

create table public.notebooks (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  book_id    uuid not null references public.books on delete cascade,
  body       text not null default '' check (char_length(body) <= 100000),
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create trigger notebooks_set_updated_at
  before update on public.notebooks
  for each row execute function public.set_updated_at();

alter table public.notebooks enable row level security;

create policy "notebooks_select_own" on public.notebooks
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notebooks_insert_own" on public.notebooks
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "notebooks_update_own" on public.notebooks
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "notebooks_delete_own" on public.notebooks
  for delete to authenticated
  using (user_id = (select auth.uid()));
