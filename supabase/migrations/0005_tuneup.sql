-- Tune-up, 25 Nov 2026.
-- 1. The live database had drifted from 0002: highlights/bookmarks used
--    hand-made "Users can ..." policies that skip the own-book check and
--    re-evaluate auth.uid() per row. Replace them with 0002's policies.
-- 2. Index the foreign keys Supabase's performance advisor flagged.

drop policy if exists "Users can view their own highlights" on public.highlights;
drop policy if exists "Users can insert their own highlights" on public.highlights;
drop policy if exists "Users can update their own highlights" on public.highlights;
drop policy if exists "Users can delete their own highlights" on public.highlights;
drop policy if exists "Users can view their own bookmarks" on public.bookmarks;
drop policy if exists "Users can insert their own bookmarks" on public.bookmarks;
drop policy if exists "Users can update their own bookmarks" on public.bookmarks;
drop policy if exists "Users can delete their own bookmarks" on public.bookmarks;

drop policy if exists "highlights_select_own" on public.highlights;
drop policy if exists "highlights_insert_own" on public.highlights;
drop policy if exists "highlights_update_own" on public.highlights;
drop policy if exists "highlights_delete_own" on public.highlights;
drop policy if exists "bookmarks_select_own" on public.bookmarks;
drop policy if exists "bookmarks_insert_own" on public.bookmarks;
drop policy if exists "bookmarks_update_own" on public.bookmarks;
drop policy if exists "bookmarks_delete_own" on public.bookmarks;

create policy "highlights_select_own" on public.highlights
  for select to authenticated using (user_id = (select auth.uid()));
create policy "highlights_insert_own" on public.highlights
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid())));
create policy "highlights_update_own" on public.highlights
  for update to authenticated using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid())));
create policy "highlights_delete_own" on public.highlights
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "bookmarks_select_own" on public.bookmarks
  for select to authenticated using (user_id = (select auth.uid()));
create policy "bookmarks_insert_own" on public.bookmarks
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid())));
create policy "bookmarks_update_own" on public.bookmarks
  for update to authenticated using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid())));
create policy "bookmarks_delete_own" on public.bookmarks
  for delete to authenticated using (user_id = (select auth.uid()));

create index if not exists bookmarks_book_id_idx on public.bookmarks (book_id);
create index if not exists chunks_user_id_idx on public.chunks (user_id);
create index if not exists conversations_book_id_idx on public.conversations (book_id);
create index if not exists highlights_book_id_idx on public.highlights (book_id);
create index if not exists messages_user_id_idx on public.messages (user_id);
create index if not exists reading_positions_book_id_idx on public.reading_positions (book_id);
