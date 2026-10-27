# Handoff

An EPUB reader with a reading companion. You upload a book, read it in a quiet paginated page, keep highlights, notes and bookmarks, and talk the book over with an AI that has read it. Your place follows you between devices.

This document covers what you need to take the codebase over: the stack, how the main pieces work, the database, the design rules the UI is held to, and what's still open.

## Contents

1. [The stack](#1-the-stack)
2. [Architecture](#2-architecture)
3. [The database](#3-the-database)
4. [Design mandates](#4-design-mandates)
5. [Open items](#5-open-items)
6. [Working on the code](#6-working-on-the-code)

## 1. The stack

| Layer | What | Notes |
|---|---|---|
| App | Next.js 15 (App Router), React 19, TypeScript | Tailwind 4, shadcn components (Base UI) in `components/ui` |
| Data, auth, files | Supabase, EU region (Frankfurt) | Postgres + pgvector, magic-link auth, a private `books` storage bucket |
| Embeddings | Mistral `mistral-embed` (1024-d) | Called directly over HTTP in `lib/mistral.ts` |
| Chat | Mistral `mistral-medium-latest` | Through the Vercel AI SDK (`ai` v7, `@ai-sdk/mistral`) |
| Web search | Exa (`api.exa.ai/search`) | Plain `fetch` in `lib/rag/web-search.ts` |
| Hosting | Vercel | **Every push to `main` deploys to production** (Git integration). Function limits assume the Hobby plan (60 s). |
| Rendering | epub.js 0.3 | In the browser only; the book is parsed separately on the server for indexing |

Environment variables (see `.env.example`):

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server clients (user-scoped, RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin client for the ingest worker; bypasses RLS |
| `MISTRAL_API_KEY`, `MISTRAL_CHAT_MODEL`, `MISTRAL_EMBED_MODEL` | Embeddings and chat |
| `EXA_API_KEY` | Web search. Unset = the companion has no web search |
| `CHAT_PROMPT_MODE` | `companion` (default) or `grounded`; see [the AI's roles](#the-ais-three-roles) |
| `INGEST_SECRET` | Lets the ingest worker call its own route to chain steps |

## 2. Architecture

```
app/
  (auth)/login            magic-link sign-in
  (app)/library           the shelf: upload, ingest status, delete
  (app)/read/[bookId]     the reader (server page loads the book row, position, notes)
  api/books               create a book row + signed upload URL
  api/books/[id]/ingest   run / continue / rebuild the index for a book
  api/chat                the companion (RAG + web search), streamed
components/reader         epub viewer, drawers, selection bar, bookmark ribbon
components/assistant      chat thread, answer rendering, citation chips
components/notes          highlights / notes / bookmarks panel
lib/epub                  server-side EPUB parsing (TOC, spine, text, cover)
lib/ingest                chunking and the resumable ingest worker
lib/rag                   retrieval, prompts, web search
lib/reader                chapter lockdown (CSP), fonts, tap selection, image pages
lib/chat                  client helpers: status line, links, emphasis
supabase/migrations       the schema, policies and SQL functions
```

`middleware.ts` refreshes the Supabase session on every request. Unauthenticated page requests go to `/login`, and API requests get a 401. The one exception is the ingest route, which authenticates itself (see below).

### Ingest pipeline

The goal is to turn an uploaded EPUB into embedded, searchable chunks without ever running longer than one Vercel function invocation.

1. **Upload.** `POST /api/books` creates the `books` row (`status = uploaded`) and returns a one-time signed upload URL. The browser uploads straight to Storage at `{user_id}/{book_id}/book.epub`, so the file never passes through a function. An RLS check on insert pins `file_path` to the user's own folder.
2. **Kick.** The browser then calls `POST /api/books/[id]/ingest`. The route checks ownership, requeues the job (`status = parsing`), responds `202` straight away, and does the work in `after()`.
3. **Steps.** `runIngestStep` (`lib/ingest/worker.ts`) does one bounded step:
   - Claims a lease with `claim_ingest()` (atomic; 90 s lease, longer than the 60 s function limit).
   - When parsing: downloads the EPUB, parses it (`lib/epub/parse.ts`: spine, TOC, cover, text; files are split at TOC anchors so chapter labels are accurate), chunks it (`lib/ingest/chunk.ts`: about 500 tokens with 50 overlap, never spanning two spine files), uploads the cover, inserts the chunks, and moves the book to `embedding`.
   - Embeds pending chunks in batches of 64 through `set_chunk_embeddings()` until 45 s have been used.
   - Releases the lease and reports `ready`, `more`, `busy`, `failed` or `retry-later`.
4. **Chaining.** On `more`, the step POSTs to its own route with `INGEST_SECRET` to start a fresh invocation.
5. **Recovery.** If a hand-off is lost, the library page's `StatusPoller` re-kicks any book whose job has gone stale (`lib/books.ts`). Attempts are counted on each claim; after 5 claims without a clean finish, the book is marked `failed` with the reason, and the user can retry.
6. **Rebuild.** `POST .../ingest?reindex=1` (owner only) rebuilds a finished book's index, for example after a parser fix.

Every step is idempotent: parsing deletes existing chunks before inserting. Mistral calls retry with backoff, and no retry wait is started past the step's deadline.

### RAG chat

`app/api/chat/route.ts`, per message:

1. Auth, validate the body, and load the book (RLS-scoped). The book must be `ready`.
2. Load the last 10 messages of the conversation as history.
3. **Retrieve** (`lib/rag/retrieve.ts`): embed the question and call `match_chunks()`, an exact cosine scan within one book. No ANN index is needed at a few thousand rows, and `security invoker` means RLS applies. It takes 12 candidates, gives passages in the chapter the reader is on a small boost, and keeps 8. Short follow-ups ("why?") are embedded together with the previous question.
4. Retrieval happens *before* anything is written, so a Mistral or database failure leaves no half-created conversation behind.
5. Create the conversation if it's new, and save the user's message.
6. **Prompt** (`lib/rag/prompt.ts`): a system prompt for the mode, the history (old `[n]` markers stripped), and a final user turn containing the numbered passages (`<excerpt n="…">`) and the question.
7. **Stream** with `streamText` into a UI message stream. The first parts written are the conversation id (if new) and the retrieved passages (`data-citations`), then the model's answer.
8. When the stream finishes, the assistant message is saved with the citations it actually used (`citationsFor`) and the model name.

On the client (`components/assistant`):
- `[n]` markers render as superscript links that jump the reader to the passage, with "From: *Book*, Chapter" chips under the answer.
- `*italics*` and `**bold**` are rendered without the marks.
- One status line shows "Searching the book…", then "Searching the web…" if a search runs (`lib/chat/activity.ts`).

### Web search (Exa) tool loop

Only in the `companion` mode, and only when `EXA_API_KEY` is set.

- `lib/rag/web-search.ts` defines a `web_search` tool. It returns 5 Exa results, each with up to 1,500 characters of page text, wrapped in `<web_result url=… title=…>` tags that are sanitised against tag injection.
- `webSearchOptions()` hands the loop to the AI SDK. If the model calls `web_search`, the SDK runs it, feeds the results back, and the model streams its answer. The loop is capped at 3 steps, and the last step has no tools, so a reply always ends in an answer.
- **When it searches:** the prompt requires a search for any factual question outside the book (another writer, an event, a place, a date), even when the model thinks it knows the answer. It must not search for questions about the book itself. As a backstop, `wantsSearch()` forces the first step to be a search when the reader asks outright ("look it up") or accepts an offered search ("yes please do").
- **How it cites:** the model gives a bare URL in parentheses. The client turns each one into a superscript letter (a, b, c, so they're kept apart from the book's numbers) plus a "From the web: site.org" chip that opens the page (`lib/chat/links.ts`).
- **Trust:** results are treated as untrusted text. The prompt tells the model to check that a page actually makes the claim, to hedge contradictory or weak results, and to treat a claim with only one source as uncertain. Each search is logged on the server (`web search: "…" → n results`).
- If a search fails, the tool tells the model to answer from what it knows and say it couldn't search.

### Reading position and cross-device sync

The position is one row per user per book in `reading_positions` (`cfi`, `percentage`, `spine_href`, `updated_at`). The logic is in `components/reader/epub-viewer.tsx`.

- **Save:** every user move ("relocated") is debounced for 2 s and then upserted. It's also flushed immediately when the tab hides (`visibilitychange`, `pagehide`). Each device remembers the `updated_at` of the newest position it has written or followed (`knownAt`).
- **Follow:** while the page is visible, the reader polls every 10 s, and also checks when the tab becomes visible again. If the saved position is newer than `knownAt`, another device moved on, so the reader jumps there.
- **Conflicts:** a local move that hasn't been saved yet always wins. It's newer, and it will overwrite the other device's position when it saves. Jumps made by following are not saved back.
- **Page numbers:** epub.js "locations" (one every 1,600 characters) give a stable page number and percentage that are the same on every screen size. They're expensive to compute, so they're cached in Storage as `locations.json` next to the book.

### Chapter sandbox (CSP)

EPUBs are untrusted and can carry scripts. epub.js renders each chapter in an iframe. The obvious lockdown, a sandbox without `allow-scripts`, breaks the reader on Safari: WebKit then also refuses to run the *app's* event listeners on the chapter document, so swipes, selection and keys go dead on iPhone and iPad. Instead (`lib/reader/content-security.ts`):

- The iframe may run scripts (`allowScriptedContent: true`), and every chapter is locked down by a `book.spine` content hook *before* it renders.
- **Layer 1:** a `<meta http-equiv="Content-Security-Policy">` is inserted as the first element of `<head>`: `script-src 'none'; object-src 'none'; base-uri 'none'`. That blocks `<script>`, inline handlers, `javascript:` URLs and plugins, and nested frames inherit it.
- **Layer 2:** the script vectors themselves are removed: `script`, `object`, `embed`, `applet`, `meta refresh`, `on*` attributes, `javascript:`/`vbscript:` URLs, and `iframe srcdoc`.
- The reader's own listeners are attached from the app, not by script inside the chapter, so the policy doesn't affect them.
- This is covered by `tests/content-security.test.ts`. **Do not change the iframe or the hook order without re-testing on a real iPad.**

## 3. The database

Postgres on Supabase. The schema is in `supabase/migrations` (0001 init, 0002 notes, 0003 drops an abandoned `notebooks` table). Generated types are in `lib/database.types.ts`.

**RLS is enabled on every table and strictly enforced per user.**
- Users can only see and change their own rows, and rows that point at a book must point at one of *their* books (checked in the insert policies).
- Storage is foldered by user id and has matching policies.
- The service-role key is used only by the ingest worker, server-side (`lib/supabase/admin.ts`).
- Every user-facing route uses the user-scoped client, so RLS, not application code, is the final word on access.

| Table | Holds | Who writes |
|---|---|---|
| `books` | Metadata, TOC, file and cover paths, ingest state (`status`, counts, lease, attempts, error) | The user inserts and deletes. **Users cannot update**: ingest state is server-owned |
| `chunks` | Text chunks with spine href, chapter title and a `vector(1024)` embedding | Service role only; users can read their own |
| `reading_positions` | One CFI per user per book, with `updated_at` for sync | The user |
| `conversations` | One per chat thread, per book | The user |
| `messages` | User and assistant turns, with `citations` (jsonb) and `model` | The user (via the chat route). Immutable: no update policy |
| `highlights` | Range CFI, text, colour (yellow/green/blue/pink), optional note, chapter | The user |
| `bookmarks` | CFI and label; unique per user, book and CFI | The user |

SQL functions:
- `match_chunks(book, embedding, k)`: retrieval; security invoker; callable by authenticated users.
- `claim_ingest(book, lease)` and `set_chunk_embeddings(book, rows)`: the worker's lease and batch writes; service role only.

Tests run the real migrations, including RLS, against an in-process Postgres (PGlite + pgvector). See `tests/helpers/db.ts`.

## 4. Design mandates

The UI is held to a few rules. When in doubt, take something away.

- **The calm page. The page is the product.** At rest the screen shows the book and nothing else: no toolbar, header or progress bar competing with the text. All chrome appears only when summoned and then goes away again.
- **Few choices, well made.** No settings sprawl. One typeface, a measured line length (about 65–70 characters on tablet and desktop), and a two-page spread from 1,000 px. These are decided for the reader, not offered as options.
- **The Baskerville standard.** The book is set in Libre Baskerville, self-hosted (`public/fonts`) and injected into each chapter iframe (`lib/reader/fonts.ts`), smaller on tablet and desktop like a printed paperback. The paper is warm (`#fbf9f4`) and the greys are warm. The chrome borrows from print: hairline icons (a spine, a nib, an asterisk), italic serif labels, footnote-style citation marks, and chips that read like marginalia.
- **Drawers, not menus.** Contents and library on the left; notes and the assistant on the right. Drawers slide *over* the page so it never re-paginates. You summon them from an edge (mouse dwell, touch swipe in from the edge), from a corner button that only appears on hover or tap, or with the keyboard. A click on the page sends them away.
- **No timers, no arrows.** No reading timers, streaks or "minutes left". No on-screen page arrows: pages turn with arrow keys, a click or tap in the margins (invisible zones that fill the white space), or a swipe on touch screens. Swipes are touch-only, so they never fight the Mac trackpad's back/forward gesture.
- **Selection is direct.** Tap once for the word, twice for the sentence, three times for the paragraph. A small bar then offers the highlight colours, and tapping a highlight opens its note in the notes drawer.
- **The assistant doesn't chatter.** It talks like a well-read friend, has opinions, cites only when it helps, and never ends a reply with a question.

## 5. Open items

**No PDF support.** Ingest, parsing and the reader are EPUB-only (`lib/epub`, epub.js). PDF would need a separate text-extraction path for ingest and a different renderer (for example pdf.js) behind the same reader shell, with its own idea of "position" in place of CFIs.

### The AI's three roles

We are still tuning these, and they pull against each other.

| Role | What it is | Where it lives | State |
|---|---|---|---|
| **Academic: citations** | Answers only from the retrieved passages and cites `[n]` for every claim | `CHAT_PROMPT_MODE=grounded`, `groundedPrompt()` | Stable but dry. No web search in this mode |
| **Seminar: conversation** | Has a view, speculates, connects, disagrees; cites only when the reader would want to check | `companion` mode (default), `companionPrompt()` | The default. Watch for it summarising or over-citing |
| **Librarian: outside knowledge** | Searches the web for facts outside the book and cites pages | `companion` mode + `EXA_API_KEY`, `WEB_SEARCH_GUIDANCE` and `wantsSearch()` | Newest. Over-triggering on book questions and confident claims from a single weak source are the risks we've been tuning |

Live behaviour is best checked with real Mistral and Exa calls through `buildPrompt` and `webSearchOptions`. The unit tests pin the prompt wording, not the model's judgement.

### Smaller known items

- **Bare follow-ups:** questions like "why?" are retrieved together with the previous question. Real question rewriting would retrieve better.
- **Reindex older books:** books ingested before commit `e5bed9e` have coarser chapter labels. `POST /api/books/[id]/ingest?reindex=1` rebuilds them.
- **Ready stripe:** the library's green "Ready" status stripe has been reported showing on the reader page.
- **Cover bars:** grey bars have been reported either side of some cover images in the reader (probably the EPUB's own wrapper styling).
- **Untested on screen:** the latest assistant UI changes (status line, web citation chips) are covered by component tests but haven't been checked in a signed-in browser on every device.

## 6. Working on the code

```bash
npm install
cp .env.example .env.local   # fill in the keys
npm run dev
npm test                     # vitest: unit, component (jsdom) and database (PGlite) tests
npm run typecheck
npm run lint
```

- Schema changes go in a new numbered file in `supabase/migrations`. Regenerate `lib/database.types.ts` afterwards, and add a test in `tests/migrations.test.ts` when it touches RLS.
- Pushing to `main` deploys to production.
- The house style for code is small, plain modules, with comments that explain *why* (especially for browser quirks). Commit messages say what changed for the reader and why.
