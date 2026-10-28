-- Academic mode.
--
-- books.publisher / published / isbn: bibliographic metadata from the EPUB's
-- package document (dc:publisher, dc:date, an ISBN dc:identifier), for
-- citing the book. Written by the ingest worker; null for books ingested
-- before this migration until they are reindexed.
--
-- highlights.verified: the reader has checked this passage (for example
-- against a print edition) and marked it as verified in the notes panel.
-- Covered by the existing highlights_update_own policy.
--
-- messages.web_sources: the web pages an assistant answer's searches
-- returned, [{url, title, author, published_date}], kept so a cited page can
-- be exported as BibTeX after the conversation is reopened. Messages stay
-- immutable; this is written once, with the answer.

alter table public.books
  add column publisher text,
  add column published text,  -- as the EPUB gives it: "1946", "1946-05-01", …
  add column isbn      text;  -- digits only (10 or 13, final X allowed)

alter table public.highlights add column verified boolean not null default false;

alter table public.messages add column web_sources jsonb;
