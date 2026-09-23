-- 0001_init: books, chunks, reading positions, conversations, messages,
-- the private `books` storage bucket, and the ingest/retrieval functions.
--
-- Write model:
--   * Users (authenticated role, RLS) create/delete their own books, and own
--     their reading positions, conversations and messages.
--   * Ingest state on `books` and all of `chunks` are written only by the
--     server with the service-role key (which bypasses RLS).

create extension if not exists vector with schema extensions;

create type public.ingest_status as enum ('uploaded', 'parsing', 'embedding', 'ready', 'failed');

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- books
-- ---------------------------------------------------------------------------
create table public.books (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users on delete cascade,
  title               text,
  author              text,
  language            text,
  file_path           text not null,          -- storage `books`: {user_id}/{book_id}/book.epub
  cover_path          text,                   -- storage `books`: {user_id}/{book_id}/cover.{ext}
  file_size           bigint,
  toc                 jsonb,                  -- [{title, href, level}]
  status              public.ingest_status not null default 'uploaded',
  chunk_count         int not null default 0,
  embedded_count      int not null default 0,
  ingest_attempts     int not null default 0, -- incremented on claim, reset on a clean step
  ingest_heartbeat_at timestamptz,            -- lease; null = no worker holds the job
  ingest_error        text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()  -- any write; used to detect stalled jobs
);

create index books_user_id_idx on public.books (user_id, created_at desc);
create index books_in_progress_idx on public.books (updated_at)
  where status in ('uploaded', 'parsing', 'embedding');

create trigger books_set_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- chunks
-- ---------------------------------------------------------------------------
create table public.chunks (
  id            bigint generated always as identity primary key,
  book_id       uuid not null references public.books on delete cascade,
  user_id       uuid not null references auth.users on delete cascade,  -- denormalized for RLS
  chunk_index   int not null,
  spine_index   int not null,
  spine_href    text not null,                -- target for epub.js rendition.display()
  chapter_title text,
  content       text not null,
  token_count   int not null,
  embedding     extensions.vector(1024),      -- mistral-embed; null until embedded
  unique (book_id, chunk_index)
);

-- Retrieval is always scoped to one book (hundreds to low thousands of rows),
-- so an exact scan after this btree beats an ANN index on recall and speed.
create index chunks_book_id_idx on public.chunks (book_id);
create index chunks_pending_idx on public.chunks (book_id, chunk_index) where embedding is null;

-- ---------------------------------------------------------------------------
-- reading_positions
-- ---------------------------------------------------------------------------
create table public.reading_positions (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  book_id    uuid not null references public.books on delete cascade,
  cfi        text not null,
  percentage real,
  spine_href text,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create trigger reading_positions_set_updated_at
  before update on public.reading_positions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- conversations / messages
-- ---------------------------------------------------------------------------
create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  book_id    uuid not null references public.books on delete cascade,
  title      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_book_idx on public.conversations (user_id, book_id, updated_at desc);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations on delete cascade,
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  citations       jsonb,                      -- [{n, chunk_id, chapter_title, spine_href}]
  model           text,
  created_at      timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.books             enable row level security;
alter table public.chunks            enable row level security;
alter table public.reading_positions enable row level security;
alter table public.conversations     enable row level security;
alter table public.messages          enable row level security;

-- books: read/create/delete own. No user updates: ingest state is server-owned.
-- The file_path check stops a user pointing a book at someone else's upload,
-- which the service-role ingest worker would otherwise happily read.
create policy "books_select_own" on public.books
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "books_insert_own" on public.books
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and file_path = (select auth.uid())::text || '/' || id::text || '/book.epub'
    and status = 'uploaded'
    and chunk_count = 0
    and embedded_count = 0
  );

create policy "books_delete_own" on public.books
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- chunks: read-only for users.
create policy "chunks_select_own" on public.chunks
  for select to authenticated
  using (user_id = (select auth.uid()));

-- reading_positions: full control of own rows, only for own books.
create policy "reading_positions_select_own" on public.reading_positions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "reading_positions_insert_own" on public.reading_positions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "reading_positions_update_own" on public.reading_positions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "reading_positions_delete_own" on public.reading_positions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- conversations: full control of own rows, only for own books.
create policy "conversations_select_own" on public.conversations
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "conversations_insert_own" on public.conversations
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "conversations_update_own" on public.conversations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "conversations_delete_own" on public.conversations
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- messages: read own; insert only into own conversations. Immutable after insert.
create policy "messages_select_own" on public.messages
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "messages_insert_own" on public.messages
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Storage policies for the private `books` bucket, one folder per user.
-- Layout: {user_id}/{book_id}/book.epub | cover.{ext} | locations.json
-- The bucket itself (private, 50 MB limit) is created through the Storage
-- API / CLI (supabase/config.toml [storage.buckets.books]), never by SQL.
-- ---------------------------------------------------------------------------
create policy "books_bucket_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'books' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "books_bucket_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'books' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- update is needed for upserts (the reader's cached locations.json).
create policy "books_bucket_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'books' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'books' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "books_bucket_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'books' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Retrieval: exact cosine search within one book. security invoker => RLS on
-- chunks applies, so a user can only ever match their own book's chunks.
-- ---------------------------------------------------------------------------
create function public.match_chunks(
  p_book_id   uuid,
  p_embedding extensions.vector(1024),
  p_k         int default 12
)
returns table (
  id            bigint,
  chunk_index   int,
  spine_index   int,
  spine_href    text,
  chapter_title text,
  content       text,
  similarity    double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select c.id, c.chunk_index, c.spine_index, c.spine_href, c.chapter_title, c.content,
         1 - (c.embedding <=> p_embedding) as similarity
  from public.chunks c
  where c.book_id = p_book_id
    and c.embedding is not null
  order by c.embedding <=> p_embedding
  limit least(greatest(p_k, 1), 50);
$$;

-- ---------------------------------------------------------------------------
-- Ingest worker functions (service role only).
-- ---------------------------------------------------------------------------

-- Atomically take the lease on a book's ingest job. Returns no row if the job
-- is not in a workable state or another worker holds a fresh lease.
-- Attempts are counted on claim so a step that crashes or times out (and so
-- never reports back) still moves the job towards `failed`.
create function public.claim_ingest(
  p_book_id       uuid,
  p_lease_seconds int default 90
)
returns setof public.books
language sql
security invoker
set search_path = ''
as $$
  update public.books
  set ingest_heartbeat_at = now(),
      ingest_attempts     = ingest_attempts + 1
  where id = p_book_id
    and status in ('parsing', 'embedding')
    and (ingest_heartbeat_at is null
         or ingest_heartbeat_at < now() - make_interval(secs => p_lease_seconds))
  returning *;
$$;

-- Write one batch of embeddings and refresh the lease.
-- p_rows: [{"id": <chunk id>, "embedding": [..1024 floats..]}, ...]
-- Returns the book's new embedded_count.
create function public.set_chunk_embeddings(
  p_book_id uuid,
  p_rows    jsonb
)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.chunks c
  set embedding = (r.value -> 'embedding')::text::extensions.vector(1024)
  from jsonb_array_elements(p_rows) as r(value)
  where c.id = (r.value ->> 'id')::bigint
    and c.book_id = p_book_id;

  update public.books b
  set embedded_count = (
        select count(*) from public.chunks
        where book_id = p_book_id and embedding is not null
      ),
      ingest_heartbeat_at = now()
  where b.id = p_book_id
  returning b.embedded_count into v_count;

  return v_count;
end;
$$;

revoke execute on function public.claim_ingest(uuid, int)          from public, anon, authenticated;
revoke execute on function public.set_chunk_embeddings(uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.claim_ingest(uuid, int)          to service_role;
grant  execute on function public.set_chunk_embeddings(uuid, jsonb) to service_role;

revoke execute on function public.match_chunks(uuid, extensions.vector, int) from public, anon;
grant  execute on function public.match_chunks(uuid, extensions.vector, int) to authenticated, service_role;
